# Jawji Controller — Redesign Flowchart

```mermaid
flowchart TD
    subgraph STARTUP["Startup"]
        A[Boot / systemd start] --> B[loadConfig]
        B --> C[loadOrCreateToken]
        C --> D[Create Express + WS Server]
        D --> E[detectPlatforms]
        E --> E1{Docker available?}
        E1 -->|Yes| E2[dockerAvailable = true]
        E1 -->|No| E3[dockerAvailable = false]
        E --> E4{BlueOS available?}
        E4 -->|Yes| E5[blueosDetected = true]
        E4 -->|No| E6[blueosDetected = false]
        E2 --> F[startLogTailing]
        E3 --> F
        E5 --> F
        E6 --> F
    end

    subgraph AUTO_SETUP["Auto-Setup (fire-and-forget)"]
        F --> G{Detect FCs\nfc-detect}
        G -->|FC found| H[getMavlinkRouterStatus]
        G -->|No FC| I[Skip mavlink setup]
        H --> H1{mavlink-router running?}
        H1 -->|No| H2[configureMavlinkRouter\nFC UART → UDP:14550 + TCP:5760]
        H1 -->|Yes| H3[Already configured]
        H2 --> J{Detect Cameras\n/dev/video*}
        H3 --> J
        I --> J
        J -->|Camera found| K[getMediaMtxSetupStatus]
        J -->|No camera| L[Skip video setup]
        K --> K1{MediaMTX running?}
        K1 -->|No| K2[configureMediaMTX\nRTSP:8554 + WebRTC:8889 + HLS:8888]
        K1 -->|Yes| K3[Already configured]
        K2 --> M[autoSetupBridge\nTCP/UDP bridge config]
        K3 --> M
        L --> M
        M --> N[setupComplete = true]
    end

    subgraph BANNER["Startup Banner + mDNS"]
        F --> O[printStartupBanner]
        O --> P[startDiscovery\nmDNS/Bonjour registration]
    end

    subgraph REST_API["REST API Endpoints"]
        D --> Q[Subnet Middleware]
        Q --> R[Auth Middleware\nBearer token check]

        R --> R1["GET /health (no auth)"]
        R --> R2["GET /api/v1/info (no auth)"]
        R --> R3["GET /api/v1/setup"]

        R --> S["GET /api/v1/network"]
        R --> T["GET /api/v1/processes"]
        R --> T1["POST /api/v1/processes/:pid/kill"]
        R --> U["GET /api/v1/services"]
        R --> U1["POST /api/v1/services/:name/:action"]
        R --> V["GET /api/v1/files"]
        R --> V1["GET /api/v1/files/read"]
        R --> V2["POST /api/v1/files/write"]
        R --> W["GET /api/v1/mediamtx"]
        R --> X["GET /api/v1/docker/containers"]
        R --> X1["POST /api/v1/docker/containers/:id/:action"]
        R --> X2["GET /api/v1/docker/containers/:id/logs"]
        R --> Y["GET /api/v1/extensions"]
        R --> Y1["GET /api/v1/extensions/available"]
        R --> Y2["POST /api/v1/extensions/install"]
        R --> Y3["DELETE /api/v1/extensions/:id"]
        R --> Y4["GET /api/v1/extensions/:id/logs"]
        R --> Z["POST /api/v1/setup/rescan"]
        R --> Z1["POST /api/v1/setup/mavlink"]
        R --> Z2["POST /api/v1/setup/video"]
    end

    subgraph WEBSOCKET["WebSocket (/ws)"]
        D --> AA[WS Upgrade Request]
        AA --> AB{Token valid?}
        AB -->|No| AC[Close 4001 Unauthorized]
        AB -->|Yes| AD[Send hello message]
        AD --> AE["Metrics stream (1s interval)"]
        AD --> AF["Process list stream (5s interval)"]
        AD --> AG["Log streaming (onLogEntry)"]
        AD --> AH{Incoming message}
        AH -->|channel=terminal| AI[Create / write PTY session]
        AH -->|resize| AJ[Resize PTY session]
    end

    subgraph SHUTDOWN["Graceful Shutdown"]
        SIGTERM[SIGTERM] --> SH[stopDiscovery]
        SIGINT[SIGINT] --> SH
        SH --> SI[stopLogTailing]
        SI --> SJ[destroyAllSessions]
        SJ --> SK[Close WS + HTTP server]
        SK --> SL[process.exit(0)]
        SK --> SM[Force exit after 2s timeout]
    end

    subgraph SECURITY["Security Layer"]
        SC1[Encrypted credentials\nAES-256-GCM] --> SC2[Ed25519 license gate\nfail-closed]
        SC2 --> SC3[Subnet enforcement]
        SC3 --> SC4[Bearer token auth]
        SC4 --> SC5[Input validation\ndevice paths, ports, baud]
    end

    subgraph PLATFORMS["Platform Integrations"]
        PL1[Docker\nContainer management] 
        PL2[BlueOS\nExtension management]
        PL3[MediaMTX\nVideo relay status]
        PL4[mavlink-router\nFC → UDP/TCP bridge]
    end

    style STARTUP fill:#1a1a2e,stroke:#0f3460,color:#e6e6e6
    style AUTO_SETUP fill:#16213e,stroke:#0f3460,color:#e6e6e6
    style BANNER fill:#16213e,stroke:#0f3460,color:#e6e6e6
    style REST_API fill:#0f3460,stroke:#533483,color:#e6e6e6
    style WEBSOCKET fill:#533483,stroke:#e94560,color:#e6e6e6
    style SHUTDOWN fill:#1a1a2e,stroke:#e94560,color:#e6e6e6
    style SECURITY fill:#0a0a23,stroke:#00d2ff,color:#e6e6e6
    style PLATFORMS fill:#1b1b3a,stroke:#6c63ff,color:#e6e6e6
```

## Legend

| Color | Section |
|-------|---------|
| Dark Navy | Startup & Shutdown |
| Deep Blue | Auto-Setup Pipeline |
| Purple | REST API |
| Magenta | WebSocket |
| Cyan | Security Layer |
| Indigo | Platform Integrations |

## Key Flows

### 1. Boot → Ready
```
Boot → loadConfig → loadOrCreateToken → Express+WS server starts
  → detectPlatforms (Docker, BlueOS)
  → startLogTailing
  → autoSetup (fire-and-forget: FC detect → mavlink-router → camera → MediaMTX → bridge)
  → printStartupBanner
  → startDiscovery (mDNS)
```

### 2. Desktop Client Connects
```
mDNS discovery or manual address → GET /api/v1/info (no auth)
  → POST pairing with token → WebSocket /ws upgrade
  → Hello handshake → Metrics/Processes/Logs streaming begins
```

### 3. Auto-Setup Pipeline
```
Scan USB serial ports → Identify FC (CP210x, CH340, CDC ACM) → Probe MAVLink heartbeat
  → Install/configure mavlink-router (UART → UDP:14550 + TCP:5760)
  → Scan /dev/video* for cameras
  → Install/configure MediaMTX (RTSP + WebRTC + HLS)
  → Configure TCP/UDP bridge
```

### 4. Security Model
```
Subnet enforcement → Bearer token auth → Input validation
  → Encrypted credentials (AES-256-GCM, device-bound key)
  → Ed25519 license gate (fail-closed, offline verification)
```

### 5. Shutdown
```
SIGTERM/SIGINT → stopDiscovery → stopLogTailing → destroyAllSessions
  → Close WebSocket + HTTP server → process.exit(0)
  → Force exit after 2s if hanging
```
