# Rempeyek Agent OS AI Family System

## AI Family Node Identity
Each recognized agent receives a permanent, deterministic identity (`Node-1`, `Node-2`, `Node-3`, ...).

## Node Storage Structure
```text
C:\Users\abrur\AppData\Local\Rempeyek-Agent-OS\Agents\
  Node-1\
    identity.json          # Node identity metadata
    config.json            # Node configuration
    skills\                # Synchronized executable skills
    memory\                # Private node memory
    cache\                 # Node runtime cache
    sessions\              # Session history
    logs\                  # Process execution logs
    checkpoints\           # Long-running task checkpoints
  Node-2\
    ...
```

## System Registries
- Machine Registry: `Vault\System\AI-Family\family-registry.json`
- Human Documentation: `Vault\System\AI-Family\AI-Family.md`
