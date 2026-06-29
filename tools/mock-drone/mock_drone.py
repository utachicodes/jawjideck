#!/usr/bin/env python3
"""
Mock Drone — simulates a MAVLink flight controller over TCP.

Run on a second laptop, then connect Jawji via TCP to <this-laptop-ip>:5760.

Usage:
    python mock_drone.py                    # defaults: 0.0.0.0:5760
    python mock_drone.py --port 5760        # custom port
    python mock_drone.py --lat 37.7749 --lon -122.4194  # start at specific coords
    python mock_drone.py --move             # auto-drive in a circle (for testing)

Controls (when --move is NOT set):
    w/s  — move forward/back (increase/decrease lat)
    a/d  — move left/right (increase/decrease lon)
    q/e  — climb/descend (increase/decrease alt)
    r    — arm/disarm toggle
    1-6  — switch flight mode
    t    — takeoff to 50m
    l    — land
    Ctrl+C — quit
"""

import argparse
import math
import socket
import struct
import sys
import threading
import time
from datetime import datetime

# ── MAVLink constants ──────────────────────────────────────────────────────

MAV_TYPE_QUADROTOR = 2
MAV_AUTOPILOT_GENERIC = 0
MAV_STATE_ACTIVE = 4
MAV_MODE_FLAG_SAFETY_ARMED = 0x80
MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 0x01

# Flight modes (ArduPilot Copter)
FLIGHT_MODES = {
    'STABILIZE': 0,
    'ACRO': 1,
    'ALT_HOLD': 2,
    'AUTO': 3,
    'GUIDED': 4,
    'LOITER': 5,
    'RTL': 6,
    'CIRCLE': 7,
    'LAND': 9,
    'POSHOLD': 16,
}

# ── State ──────────────────────────────────────────────────────────────────

class DroneState:
    def __init__(self, lat, lon, alt):
        self.lat = lat
        self.lon = lon
        self.alt = alt
        self.heading = 0.0
        self.pitch = 0.0
        self.roll = 0.0
        self.ground_speed = 0.0
        self.air_speed = 0.0
        self.climb_rate = 0.0
        self.armed = False
        self.flight_mode = 'STABILIZE'
        self.battery_voltage = 12.6
        self.battery_remaining = 100
        self.satellites = 12
        self.fix_type = 3  # 3D fix
        self.hdop = 0.9
        self.system_id = 1
        self.component_id = 1
        self.custom_mode = 0
        self.throttle = 0
        self.target_alt = 0.0
        self.mode_timestamp = time.time()

    def to_dict(self):
        return {
            'lat': self.lat, 'lon': self.lon, 'alt': self.alt,
            'heading': self.heading, 'pitch': self.pitch, 'roll': self.roll,
            'ground_speed': self.ground_speed, 'armed': self.armed,
            'flight_mode': self.flight_mode, 'battery_voltage': self.battery_voltage,
            'satellites': self.satellites,
        }

# ── MAVLink packet builder (v2, no CRC extra for simplicity) ──────────────

def crc_accumulate(data, crc):
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0x8408
            else:
                crc >>= 1
    return crc

def crc16_mavlink(data):
    return crc_accumulate(data, 0xFFFF)

def pack_uint8(v):
    return struct.pack('<B', v & 0xFF)

def pack_uint16(v):
    return struct.pack('<H', v & 0xFFFF)

def pack_int32(v):
    return struct.pack('<i', v)

def pack_uint32(v):
    return struct.pack('<I', v & 0xFFFFFFFF)

def pack_int16(v):
    return struct.pack('<h', v)

def pack_float(v):
    return struct.pack('<f', v)

def make_mavlink_v2(sysid, compid, msgid, payload):
    """Build a MAVLink v2 packet."""
    # Header
    magic = 0xFE
    incompat = 0  # no signing
    compat = 0
    seq = 0  # incremented per packet
    length = len(payload)
    header = struct.pack('<BBBBBB', magic, length, incompat, compat, seq, sysid, compid)
    # Msgid (3 bytes, little-endian)
    msgid_bytes = struct.pack('<I', msgid)[:3]
    # Full message for CRC (header + msgid + payload)
    crc_data = header[1:] + msgid_bytes + payload  # length, incompat, compat, seq, sysid, compid, msgid, payload
    crc = crc16_mavlink(crc_data)
    # CRC extra for this message type (simplified — using 0 for most)
    # In real MAVLink, each message has a CRC_EXTRA. We'll use 0 for simplicity
    # since Jawji doesn't strictly validate CRC_EXTRA on incoming packets.
    crc_extra = get_crc_extra(msgid)
    crc = crc_accumulate([crc_extra], crc)
    crc_bytes = struct.pack('<H', crc)
    return header + msgid_bytes + payload + crc_bytes

def get_crc_extra(msgid):
    """CRC_EXTRA values for common message types."""
    return {
        0: 50,    # HEARTBEAT
        24: 24,   # GPS_RAW_INT
        30: 39,   # ATTITUDE
        74: 20,   # VFR_HUD
        1: 124,   # SYS_STATUS
    }.get(msgid, 0)

# ── Message builders ───────────────────────────────────────────────────────

_seq = 0

def next_seq():
    global _seq
    _seq = (_seq + 1) % 256
    return _seq

def build_heartbeat(state):
    """Msg ID 0"""
    type_ = MAV_TYPE_QUADROTOR
    autopilot = MAV_AUTOPILOT_GENERIC
    base_mode = 0
    if state.armed:
        base_mode |= MAV_MODE_FLAG_SAFETY_ARMED
    base_mode |= MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
    custom_mode = FLIGHT_MODES.get(state.flight_mode, 0)
    system_status = MAV_STATE_ACTIVE
    mavlink_version = 3

    payload = pack_uint8(type_) + pack_uint8(autopilot) + pack_uint8(base_mode) + \
              pack_uint32(custom_mode) + pack_uint8(system_status) + pack_uint8(mavlink_version)
    return make_mavlink_v2(state.system_id, state.component_id, 0, payload)

def build_gps_raw_int(state):
    """Msg ID 24"""
    time_usec = int(time.time() * 1e6)
    fix_type = state.fix_type
    lat = int(state.lat * 1e7)
    lon = int(state.lon * 1e7)
    alt = int(state.alt * 1000)  # mm
    eph = int(state.hdop * 100)
    epv = 100
    vel = int(state.ground_speed * 100)  # cm/s
    cog = int(state.heading * 100)
    satellites = state.satellites

    payload = pack_uint32(time_usec) + pack_uint8(fix_type) + \
              pack_uint8(satellites) + pack_uint16(eph) + pack_uint16(epv) + \
              pack_int32(lat) + pack_int32(lon) + pack_int32(alt) + \
              pack_uint16(vel) + pack_uint16(cog)
    return make_mavlink_v2(state.system_id, state.component_id, 24, payload)

def build_attitude(state):
    """Msg ID 30"""
    time_usec = int(time.time() * 1e6)
    roll = math.radians(state.roll)
    pitch = math.radians(state.pitch)
    yaw = math.radians(state.heading)
    rollspeed = 0.0
    pitchspeed = 0.0
    yawspeed = 0.0

    payload = pack_uint32(time_usec) + pack_float(roll) + pack_float(pitch) + \
              pack_float(yaw) + pack_float(rollspeed) + pack_float(pitchspeed) + pack_float(yawspeed)
    return make_mavlink_v2(state.system_id, state.component_id, 30, payload)

def build_vfr_hud(state):
    """Msg ID 74"""
    airspeed = state.air_speed
    groundspeed = state.ground_speed
    heading = int(state.heading) % 360
    throttle = state.throttle
    alt = state.alt
    climb = state.climb_rate

    payload = pack_float(airspeed) + pack_float(groundspeed) + pack_uint16(heading) + \
              pack_uint16(throttle) + pack_float(alt) + pack_float(climb)
    return make_mavlink_v2(state.system_id, state.component_id, 74, payload)

def build_sys_status(state):
    """Msg ID 1"""
    voltage_battery = int(state.battery_voltage * 1000)  # mV
    current_battery = -1
    battery_remaining = state.battery_remaining

    payload = pack_uint32(0) + pack_uint16(0) + pack_int16(0) + \
              pack_int16(0) + pack_int16(0) + pack_int16(0) + pack_int16(0) + \
              pack_int16(current_battery) + pack_uint8(battery_remaining) + \
              pack_uint16(0) + pack_uint16(0) + pack_uint16(0) + \
              pack_uint16(0) + pack_int32(0) + pack_uint16(voltage_battery)
    return make_mavlink_v2(state.system_id, state.component_id, 1, payload)

def build_statustext(text, severity=6):
    """Msg ID 253"""
    payload = pack_uint8(severity) + text.encode('utf-8')[:50].ljust(50, b'\x00')
    return make_mavlink_v2(1, 1, 253, payload)

# ── TCP Server ─────────────────────────────────────────────────────────────

def send_telemetry(conn, state, lock):
    """Send telemetry packets at ~4Hz."""
    try:
        while True:
            with lock:
                packets = [
                    build_heartbeat(state),
                    build_gps_raw_int(state),
                    build_attitude(state),
                    build_vfr_hud(state),
                    build_sys_status(state),
                ]
            for pkt in packets:
                conn.sendall(pkt)
            time.sleep(0.25)  # 4Hz
    except (ConnectionResetError, BrokenPipeError, OSError):
        pass

def handle_client(conn, addr, state, lock):
    """Handle a single client connection."""
    print(f'[+] Connected: {addr[0]}:{addr[1]}')
    conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

    # Send welcome message
    try:
        conn.sendall(build_statustext('Mock drone connected', 6))
    except Exception:
        pass

    # Start telemetry sender thread
    sender = threading.Thread(target=send_telemetry, args=(conn, state, lock), daemon=True)
    sender.start()

    # Listen for incoming commands
    try:
        while True:
            data = conn.recv(1024)
            if not data:
                break
            # Parse minimal MAVLink for COMMAND_LONG (msg 76) to handle arm/disarm
            # For simplicity, we just acknowledge any packet
    except (ConnectionResetError, BrokenPipeError, OSError):
        pass
    finally:
        conn.close()
        print(f'[-] Disconnected: {addr[0]}:{addr[1]}')

def server_thread(host, port, state, lock):
    """TCP server that accepts one connection at a time."""
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((host, port))
    srv.listen(1)
    display_host = host if host else '0.0.0.0'
    print(f'[*] Listening on {display_host}:{port}')
    print(f'    Connect Jawji via TCP to this address')
    print()

    while True:
        conn, addr = srv.accept()
        # Handle each client in a thread
        client = threading.Thread(target=handle_client, args=(conn, addr, state, lock), daemon=True)
        client.start()

# ── Auto-move mode (circle) ────────────────────────────────────────────────

def auto_move(state, lock):
    """Simulate a circular flight path."""
    center_lat = state.lat
    center_lon = state.lon
    radius_deg = 0.0002  # ~22m
    speed = 0.5  # radians per second
    t0 = time.time()

    while True:
        t = time.time() - t0
        with lock:
            state.lat = center_lat + radius_deg * math.cos(speed * t)
            state.lon = center_lon + radius_deg * math.sin(speed * t)
            state.alt = 50.0 + 5.0 * math.sin(0.2 * t)  # oscillate 45-55m
            state.heading = (math.degrees(speed * t) + 90) % 360
            state.ground_speed = radius_deg * 111320 * speed  # m/s approx
            state.air_speed = state.ground_speed * 1.1
            state.roll = 15.0 * math.sin(speed * t)
            state.pitch = 5.0 * math.sin(0.2 * t)
            state.climb_rate = 5.0 * 0.2 * math.cos(0.2 * t)
            state.throttle = 50
        time.sleep(0.1)

# ── Keyboard input ─────────────────────────────────────────────────────────

def keyboard_input(state, lock):
    """Read keyboard for manual control."""
    try:
        import msvcrt  # Windows
    except ImportError:
        import tty, termios  # Linux/Mac
        msvcrt = None

    print('Controls: w/s=forward/back  a/d=left/right  q/e=up/down')
    print('          r=arm/disarm  1-6=mode  t=takeoff  l=land  Ctrl+C=quit')
    print()

    while True:
        if msvcrt:
            if msvcrt.kbhit():
                key = msvcrt.getch().decode('utf-8', errors='ignore').lower()
                _handle_key(key, state, lock)
            time.sleep(0.05)
        else:
            # Linux/Mac fallback
            try:
                import sys
                key = sys.stdin.read(1)
                _handle_key(key, state, lock)
            except Exception:
                time.sleep(0.1)

def _handle_key(key, state, lock):
    step_lat = 0.00005  # ~5.5m
    step_lon = 0.00005
    step_alt = 2.0

    with lock:
        if key == 'w':
            state.lat += step_lat
            state.heading = 0
            state.ground_speed = 5.0
        elif key == 's':
            state.lat -= step_lat
            state.heading = 180
            state.ground_speed = 5.0
        elif key == 'a':
            state.lon -= step_lon
            state.heading = 270
            state.ground_speed = 5.0
        elif key == 'd':
            state.lon += step_lon
            state.heading = 90
            state.ground_speed = 5.0
        elif key == 'q':
            state.alt += step_alt
            state.climb_rate = 2.0
        elif key == 'e':
            state.alt = max(0, state.alt - step_alt)
            state.climb_rate = -2.0
        elif key == 'r':
            state.armed = not state.armed
            print(f'    {"ARMED" if state.armed else "DISARMED"}')
        elif key == 't':
            state.armed = True
            state.flight_mode = 'GUIDED'
            state.target_alt = 50.0
            print('    TAKEOFF → 50m')
        elif key == 'l':
            state.flight_mode = 'LAND'
            print('    LAND')
        elif key in FLIGHT_MODES:
            mode_num = int(key) if key.isdigit() else -1
            mode_names = list(FLIGHT_MODES.keys())
            if 1 <= mode_num <= 6 and mode_num <= len(mode_names):
                state.flight_mode = mode_names[mode_num - 1]
                print(f'    MODE → {state.flight_mode}')

# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Mock MAVLink drone over TCP')
    parser.add_argument('--host', default='', help='Bind address (default: all interfaces)')
    parser.add_argument('--port', type=int, default=5760, help='TCP port (default: 5760)')
    parser.add_argument('--lat', type=float, default=37.7749, help='Start latitude (default: San Francisco)')
    parser.add_argument('--lon', type=float, default=-122.4194, help='Start longitude')
    parser.add_argument('--alt', type=float, default=100.0, help='Start altitude in meters (default: 100)')
    parser.add_argument('--move', action='store_true', help='Auto-fly in a circle')
    parser.add_argument('--sitl', action='store_true', help='Act as SITL (auto-arm, GUIDED mode)')
    args = parser.parse_args()

    state = DroneState(args.lat, args.lon, args.alt)
    lock = threading.Lock()

    if args.sitl:
        state.armed = True
        state.flight_mode = 'GUIDED'
        state.custom_mode = FLIGHT_MODES['GUIDED']

    print('╔══════════════════════════════════════════╗')
    print('║       Mock Drone — MAVLink TCP           ║')
    print('╚══════════════════════════════════════════╝')
    print(f'  Position: {state.lat:.6f}, {state.lon:.6f} @ {state.alt:.0f}m')
    print(f'  Mode: {state.flight_mode}')
    print()

    # Show LAN IP so the user knows what to put in Jawji
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        print(f'  ┌──────────────────────────────────────────┐')
        print(f'  │  In Jawji, connect via TCP to:           │')
        print(f'  │                                          │')
        print(f'  │    Address: {local_ip:<28s}│')
        print(f'  │    Port:    {str(args.port):<28s}│')
        print(f'  │    Protocol: MAVLink                     │')
        print(f'  └──────────────────────────────────────────┘')
        print()
    except Exception:
        pass

    # Start server
    server = threading.Thread(target=server_thread, args=(args.host, args.port, state, lock), daemon=True)
    server.start()

    if args.move:
        # Auto-move in a circle
        mover = threading.Thread(target=auto_move, args=(state, lock), daemon=True)
        mover.start()
        print('[*] Auto-move: flying in a circle')
        print('    Press Ctrl+C to stop')
        try:
            while True:
                time.sleep(1)
                with lock:
                    print(f'\r  lat={state.lat:.6f}  lon={state.lon:.6f}  alt={state.alt:.1f}m  hdg={state.heading:.0f}°  spd={state.ground_speed:.1f}m/s', end='', flush=True)
        except KeyboardInterrupt:
            print('\n[*] Stopped')
    else:
        # Manual keyboard control
        kb = threading.Thread(target=keyboard_input, args=(state, lock), daemon=True)
        kb.start()
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print('\n[*] Stopped')

if __name__ == '__main__':
    main()
