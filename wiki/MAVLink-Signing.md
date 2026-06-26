# MAVLink Signing

MAVLink Signing prevents unauthorized GCS or radios from controlling your vehicle by requiring every packet to carry a SHA-256 signature derived from a shared key. It's available on the Safety tab for ArduPilot vehicles connected over MAVLink v2.

> Requires MAVLink v2. If your board only speaks MAVLink v1, signing shows as **Unavailable**.

## Setup

### Step 1: Set a signing key

Enter a passphrase, or paste a base64/hex key exported from Mission Planner. You can add more than one key — all saved keys are tried automatically on connect, which is useful when switching between a vehicle and a UDP/TCP proxy (MAVProxy, UDPProxy) that uses a different key.

### Step 2: Activate on flight controller

Click **Send to FC** to push the key to the vehicle and enable signing on both sides. Both the GCS and the flight controller must share the same key for packets to validate.

## Controls

Once configured and connected:

- **Packet signing toggle** — pause/resume signing without losing the saved key.
- **FC signing verification** — shows whether the vehicle is sending back signed packets, confirming the key matches on both ends.
- **Disable signing and remove key** — turns off signing on the flight controller and deletes the local key. After this, any GCS can connect without a key.

## Key mismatch

If the vehicle or proxy uses a different key, you'll see a **Signing key mismatch** warning. Paste the correct base64 key (from Mission Planner or the proxy) to resolve it.

## Network connections

When connected over TCP or UDP (commonly through a proxy like MAVProxy or UDPProxy), enter the same passphrase configured on the proxy, or paste its base64 key directly.

See also: [[Safety and Failsafe]] for the rest of the Safety tab's configuration.
