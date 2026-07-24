# n8n Workflow Automation Setup

Local n8n setup for orchestrating lead generation, web scoring, and outreach workflows.

---

## 🚀 Quickstart

### 1. Start n8n

From the `n8n/` folder:

```bash
docker compose up -d
```

*(or from the project root using pnpm)*:

```bash
pnpm n8n:up
```

### 2. Access n8n UI

Open your browser at:
👉 **[http://localhost:5678](http://localhost:5678)**

On first launch, n8n will ask you to set up an owner account (email & password).

---

## 🛠️ Operational Commands

| Action | Command (inside `n8n/`) | Root Command |
|--------|--------------------------|--------------|
| **Start / Background** | `docker compose up -d` | `pnpm n8n:up` |
| **Stop** | `docker compose down` | `pnpm n8n:down` |
| **View Live Logs** | `docker compose logs -f` | `pnpm n8n:logs` |
| **Check Status** | `docker compose ps` | — |

---

## 🔌 Connecting n8n to Host Services (Ollama & Express API)

Because n8n runs inside a Docker container, **`localhost` inside n8n refers to the container itself**, not your computer.

To connect n8n nodes to services running on your host machine:

### 1. Ollama (Port 11434)
- **Base URL in n8n**: `http://host.docker.internal:11434`
- Do **NOT** use `http://localhost:11434`.

### 2. Leads Agent Server API (Port 3001)
- **Base URL in n8n**: `http://host.docker.internal:3001`
- Example HTTP Request node endpoint: `http://host.docker.internal:3001/api/health`

---

## 🐧 Cross-Platform Host Resolution (`host.docker.internal`)

- **Windows & macOS (Docker Desktop)**: `host.docker.internal` is supported natively by Docker Desktop.
- **Linux (Docker Engine)**: Linux does not resolve `host.docker.internal` by default. To ensure cross-platform compatibility, the `docker-compose.yml` includes:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

This maps `host.docker.internal` to the host network gateway across all platforms (Windows, Mac, and Linux).

---

## 💾 Data Persistence

All workflows, execution history, credentials, and settings are saved to a named Docker volume (`n8n_data`). Your data will survive container restarts and updates.
