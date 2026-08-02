/**
 * Rempeyek Agent OS - Web Application & Card Component Interactivity
 */

// 21 Built-in Agents Dataset
const AGENTS_DATA = [
  { id: "hermes", name: "Hermes", icon: "🟢", node: "Node-1", role: "Crypto, research, and operations agent", provider: "hermes", runtime: "service", home: "~/.hermes", caps: ["research", "operations", "crypto"] },
  { id: "openclaw", name: "OpenClaw", icon: "🔵", node: "Node-2", role: "Strategy and business analysis agent", provider: "openclaw", runtime: "service", home: "~/.openclaw", caps: ["strategy", "analysis", "business"] },
  { id: "antigravity", name: "Antigravity", icon: "🟠", node: "Node-3", role: "Advanced agentic coding and integration", provider: "gemini", runtime: "task", home: "~/.gemini", caps: ["coding", "integration", "design"] },
  { id: "cline", name: "Cline", icon: "🟡", node: "Node-4", role: "Autonomous coding agent", provider: "claude", runtime: "task", home: "~/.cline", caps: ["coding", "implementation"] },
  { id: "codex", name: "Codex", icon: "⬜", node: "Node-5", role: "Repository-aware software engineering agent", provider: "openai", runtime: "task", home: "~/.codex", caps: ["coding", "engineering", "audit"] },
  { id: "claude-code", name: "Claude Code", icon: "⚫", node: "Node-6", role: "Coding & technical specialist", provider: "claude", runtime: "task", home: "~/.claude", caps: ["coding", "technical"] },
  { id: "github-copilot-cli", name: "GitHub Copilot CLI", icon: "🐙", node: "Node-7", role: "GitHub Copilot terminal assistant", provider: "github", runtime: "task", home: "~/.copilot", caps: ["coding", "cli"] },
  { id: "opencode", name: "OpenCode", icon: "🔓", node: "Node-8", role: "Open-source terminal AI coding assistant", provider: "opencode", runtime: "task", home: "~/.opencode", caps: ["coding", "open-source"] },
  { id: "qwen-code", name: "Qwen Code", icon: "🔤", node: "Node-9", role: "Open-source Qwen terminal coding agent", provider: "qwen", runtime: "task", home: "~/.qwen", caps: ["coding", "open-source"] },
  { id: "aider", name: "Aider", icon: "⚡", node: "Node-10", role: "AI pair programming terminal agent", provider: "aider", runtime: "task", home: "~/.aider", caps: ["coding", "pair-programming"] },
  { id: "goose", name: "Goose", icon: "🪿", node: "Node-11", role: "Open-source AI developer agent", provider: "goose", runtime: "task", home: "~/.goose", caps: ["coding", "automation"] },
  { id: "openhands", name: "OpenHands", icon: "🙌", node: "Node-12", role: "Autonomous AI software engineer", provider: "openhands", runtime: "task", home: "~/.openhands", caps: ["coding", "engineering"] },
  { id: "mistral-vibe", name: "Mistral Vibe", icon: "🌊", node: "Node-13", role: "Mistral terminal coding assistant", provider: "mistral", runtime: "task", home: "~/.vibe", caps: ["coding", "terminal"] },
  { id: "cursor-agent", name: "Cursor Agent", icon: "🖱️", node: "Node-14", role: "Cursor terminal and IDE agent", provider: "cursor", runtime: "task", home: "~/.cursor", caps: ["coding", "ide"] },
  { id: "crush", name: "Crush", icon: "🔨", node: "Node-15", role: "Charm terminal AI coding agent", provider: "crush", runtime: "task", home: "~/.crush", caps: ["coding", "terminal"] },
  { id: "crimson-odyssey", name: "Crimson Odyssey", icon: "🔴", node: "Node-16", role: "Crimson Odyssey specialized agent", provider: "crimson", runtime: "task", home: "~/.crimson", caps: ["coding", "specialized"] },
  { id: "kimi-code", name: "Kimi Code", icon: "🌙", node: "Node-17", role: "Moonshot terminal AI agent", provider: "moonshot", runtime: "task", home: "~/.kimi", caps: ["coding", "terminal"] },
  { id: "kilo-code", name: "Kilo Code", icon: "🟣", node: "Node-18", role: "Development agent for coding and debugging", provider: "kilo", runtime: "task", home: "~/.kilocode", caps: ["coding", "debugging"] },
  { id: "pi", name: "Pi", icon: "🌀", node: "Node-19", role: "Minimal open-source coding agent", provider: "pi", runtime: "task", home: "~/.pi", caps: ["coding", "minimal"] },
  { id: "grok-build", name: "Grok Build", icon: "🚀", node: "Node-20", role: "xAI Grok terminal build agent", provider: "xai", runtime: "task", home: "~/.grok", caps: ["coding", "build"] },
  { id: "command-code", name: "Command Code", icon: "⌨️", node: "Node-21", role: "Command Code terminal agent", provider: "commandcode", runtime: "task", home: "~/.commandcode", caps: ["coding", "terminal"] }
];

let activeAgent = null;

document.addEventListener("DOMContentLoaded", () => {
  renderAgentGrid();
  setupGlobalListeners();
});

/**
 * Render all 21 Agent Cards into the grid.
 */
function renderAgentGrid() {
  const grid = document.getElementById("agent-grid");
  if (!grid) return;
  grid.innerHTML = "";

  AGENTS_DATA.forEach(agent => {
    const card = createAgentCardElement(agent);
    grid.appendChild(card);
  });
}

/**
 * Create a single Agent Card element with split-button dropdown.
 */
function createAgentCardElement(agent) {
  const card = document.createElement("article");
  card.className = "agent-card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${agent.name} Card`);
  card.dataset.agentId = agent.id;

  // Header & Info
  card.innerHTML = `
    <div class="agent-card-header">
      <div class="agent-icon">${agent.icon}</div>
      <div class="agent-title-group">
        <div class="agent-name">${agent.name}</div>
        <div class="agent-node">${agent.node}</div>
      </div>
    </div>
    <div class="agent-role">${agent.role}</div>
    <div class="agent-card-actions" data-action-control="true">
      <div class="split-button-group">
        <button type="button" class="btn-primary main-action-btn" data-action="Summon">
          <span class="btn-text">Summon</span>
        </button>
        <button type="button" class="btn-dropdown-toggle" aria-expanded="false" aria-haspopup="true" aria-label="Toggle options menu">
          ▼
        </button>
        <div class="dropdown-menu" role="menu">
          <button type="button" class="dropdown-item" role="menuitem" data-action="Summon">
            Summon
          </button>
          <button type="button" class="dropdown-item" role="menuitem" data-action="Gateway Run">
            Gateway Run
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  setupCardInteractivity(card, agent);
  return card;
}

/**
 * Setup split-button dropdown interactivity and card profile click.
 */
function setupCardInteractivity(card, agent) {
  const actionsContainer = card.querySelector(".agent-card-actions");
  const mainBtn = card.querySelector(".main-action-btn");
  const toggleBtn = card.querySelector(".btn-dropdown-toggle");
  const dropdownMenu = card.querySelector(".dropdown-menu");
  const dropdownItems = card.querySelectorAll(".dropdown-item");

  let isOpen = false;
  let isLoading = false;

  // Function to toggle dropdown
  const toggleDropdown = (show) => {
    isOpen = typeof show === "boolean" ? show : !isOpen;
    if (isOpen) {
      // Close any other open dropdowns first
      closeAllDropdowns();
      dropdownMenu.classList.add("show");
      toggleBtn.setAttribute("aria-expanded", "true");
    } else {
      dropdownMenu.classList.remove("show");
      toggleBtn.setAttribute("aria-expanded", "false");
    }
  };

  // Prevent event bubbling on action controls so card click is NOT triggered
  actionsContainer.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  actionsContainer.addEventListener("keydown", (e) => {
    e.stopPropagation();
  });

  // Toggle button click
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (isLoading) return;
    toggleDropdown();
  });

  // Main action button click
  mainBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (isLoading) return;
    const action = mainBtn.dataset.action || "Summon";
    executeAction(agent, action, mainBtn);
  });

  // Dropdown item selection
  dropdownItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (isLoading) return;
      const selectedAction = item.dataset.action;
      mainBtn.dataset.action = selectedAction;
      mainBtn.querySelector(".btn-text").textContent = selectedAction;
      toggleDropdown(false);
      executeAction(agent, selectedAction, mainBtn);
    });
  });

  // Keyboard Navigation inside actions container
  actionsContainer.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      toggleDropdown(false);
      toggleBtn.focus();
    } else if (e.key === "ArrowDown" && isOpen) {
      e.preventDefault();
      const firstItem = dropdownItems[0];
      if (firstItem) firstItem.focus();
    } else if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault();
      const lastItem = dropdownItems[dropdownItems.length - 1];
      if (lastItem) lastItem.focus();
    }
  });

  // Keyboard navigation within dropdown items
  dropdownItems.forEach((item, index) => {
    item.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = dropdownItems[index + 1] || dropdownItems[0];
        next.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = dropdownItems[index - 1] || dropdownItems[dropdownItems.length - 1];
        prev.focus();
      }
    });
  });

  // Clicking on Card outside action control opens Agent Profile
  card.addEventListener("click", (e) => {
    // If click originated inside action control, ignore
    if (e.target.closest(".agent-card-actions")) {
      return;
    }
    openAgentProfile(agent);
  });

  // Keyboard Enter / Space on Card opens Agent Profile
  card.addEventListener("keydown", (e) => {
    if (e.target.closest(".agent-card-actions")) {
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAgentProfile(agent);
    }
  });

  /**
   * Execute Action with loading state and double click prevention.
   */
  function executeAction(agentObj, actionName, btnElement) {
    if (isLoading) return;
    isLoading = true;

    // Set loading state UI
    const originalText = btnElement.querySelector(".btn-text").textContent;
    btnElement.disabled = true;
    toggleBtn.disabled = true;
    btnElement.innerHTML = `<span class="spinner"></span> <span>${actionName}...</span>`;

    // Simulate async command execution
    setTimeout(() => {
      isLoading = false;
      btnElement.disabled = false;
      toggleBtn.disabled = false;
      btnElement.innerHTML = `<span class="btn-text">${actionName}</span>`;
    }, 1200);
  }
}

/**
 * Close all open dropdown menus.
 */
function closeAllDropdowns() {
  document.querySelectorAll(".dropdown-menu.show").forEach((menu) => {
    menu.classList.remove("show");
  });
  document.querySelectorAll(".btn-dropdown-toggle[aria-expanded='true']").forEach((toggle) => {
    toggle.setAttribute("aria-expanded", "false");
  });
}

/**
 * Setup global event listeners (Click outside, Escape key).
 */
function setupGlobalListeners() {
  // Click outside closes dropdowns
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".agent-card-actions")) {
      closeAllDropdowns();
    }
  });

  // Global Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllDropdowns();
    }
  });
}

/**
 * Open Agent Profile with auto-scroll, smooth scrolling, focus heading, and pulse highlight.
 */
function openAgentProfile(agent) {
  activeAgent = agent;

  const profileSection = document.getElementById("agent-profile-section");
  const heading = document.getElementById("profile-heading");

  // Render profile data
  document.getElementById("profile-icon").textContent = agent.icon;
  heading.textContent = `${agent.name} Profile`;
  document.getElementById("profile-node-id").textContent = agent.node;
  document.getElementById("profile-role").textContent = agent.role;
  document.getElementById("profile-provider").textContent = `${agent.provider} (${agent.runtime})`;
  document.getElementById("profile-home").textContent = agent.home;
  document.getElementById("profile-capabilities").textContent = agent.caps.join(", ");

  // Show profile section
  profileSection.classList.remove("hidden");

  // DOM update callback using requestAnimationFrame to ensure render completion before scroll
  requestAnimationFrame(() => {
    // 1. Smooth scroll to top of profile section
    profileSection.scrollIntoView({ behavior: "smooth", block: "start" });

    // 2. Set focus on heading for screen readers & keyboard users
    heading.setAttribute("tabindex", "-1");
    heading.focus();

    // 3. Visual pulse highlight animation
    profileSection.classList.remove("highlight-pulse");
    // Trigger reflow to restart animation
    void profileSection.offsetWidth;
    profileSection.classList.add("highlight-pulse");
  });
}

// Export for unit tests
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AGENTS_DATA,
    createAgentCardElement,
    openAgentProfile,
    closeAllDropdowns
  };
}
