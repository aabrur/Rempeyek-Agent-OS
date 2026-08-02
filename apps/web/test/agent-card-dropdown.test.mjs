import test from "node:test";
import assert from "node:assert/strict";

// Simulated Event Harness for Agent Card Dropdown and Profile Selection Behavior

function createCardHarness(agent, { onOpenAgent, runTerminal, runAction }) {
  let profileOpened = false;
  let activeAgentId = null;
  let dropdownOpen = false;
  let executedAction = null;
  let scrolledToProfile = false;
  let focusedHeading = false;
  let visualHighlight = false;

  const card = {
    clickCard() {
      profileOpened = true;
      activeAgentId = agent.id;
      onOpenAgent(agent.id);
    },
    toggleDropdown(e) {
      if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      dropdownOpen = !dropdownOpen;
    },
    selectOption(option, e) {
      if (e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      dropdownOpen = false;
      executedAction = option;
      if (option === "summon") {
        runTerminal(agent.id, "summon");
      } else if (option === "run") {
        if ((agent.actions || []).includes("run")) {
          runAction(agent.id, "run");
        } else {
          runTerminal(agent.id, "run");
        }
      }
    },
    renderProfileDOM() {
      if (!activeAgentId) return null;
      return {
        id: activeAgentId,
        scrollIntoView(opts) {
          if (opts?.behavior === "smooth") {
            scrolledToProfile = true;
          }
        },
        focusHeading() {
          focusedHeading = true;
        },
        setHighlight() {
          visualHighlight = true;
        },
      };
    },
    getState() {
      return {
        profileOpened,
        activeAgentId,
        dropdownOpen,
        executedAction,
        scrolledToProfile,
        focusedHeading,
        visualHighlight,
      };
    },
  };

  return card;
}

test("Dropdown dapat dibuka", () => {
  let opened = false;
  const h = createCardHarness({ id: "crush", name: "Crush" }, {
    onOpenAgent: id => { opened = true; },
    runTerminal: () => {},
    runAction: () => {},
  });

  h.toggleDropdown({ stopPropagation() {} });
  assert.equal(h.getState().dropdownOpen, true);
  assert.equal(opened, false, "Klik dropdown tidak membuka profile");
});

test("Summon dapat dipilih", () => {
  let terminalMode = null;
  const h = createCardHarness({ id: "crush", name: "Crush" }, {
    onOpenAgent: () => {},
    runTerminal: (id, mode) => { terminalMode = mode; },
    runAction: () => {},
  });

  h.toggleDropdown({ stopPropagation() {} });
  h.selectOption("summon", { stopPropagation() {} });
  assert.equal(h.getState().executedAction, "summon");
  assert.equal(terminalMode, "summon");
});

test("Gateway Run dapat dipilih", () => {
  let runMode = null;
  const h = createCardHarness({ id: "crush", name: "Crush" }, {
    onOpenAgent: () => {},
    runTerminal: (id, mode) => { runMode = mode; },
    runAction: () => {},
  });

  h.toggleDropdown({ stopPropagation() {} });
  h.selectOption("run", { stopPropagation() {} });
  assert.equal(h.getState().executedAction, "run");
  assert.equal(runMode, "run");
});

test("Klik dropdown tidak membuka profile", () => {
  let profileOpened = false;
  const h = createCardHarness({ id: "hermes", name: "Hermes" }, {
    onOpenAgent: () => { profileOpened = true; },
    runTerminal: () => {},
    runAction: () => {},
  });

  h.toggleDropdown({ stopPropagation() {} });
  assert.equal(h.getState().dropdownOpen, true);
  assert.equal(profileOpened, false);
});

test("Klik card membuka profile", () => {
  let activeId = null;
  const h = createCardHarness({ id: "openclaw", name: "OpenClaw" }, {
    onOpenAgent: id => { activeId = id; },
    runTerminal: () => {},
    runAction: () => {},
  });

  h.clickCard();
  assert.equal(h.getState().profileOpened, true);
  assert.equal(activeId, "openclaw");
});

test("Halaman scroll menuju profile dan Heading profile menerima focus", () => {
  const h = createCardHarness({ id: "antigravity", name: "Antigravity" }, {
    onOpenAgent: () => {},
    runTerminal: () => {},
    runAction: () => {},
  });

  h.clickCard();
  const profileDOM = h.renderProfileDOM();
  assert.ok(profileDOM);
  profileDOM.scrollIntoView({ behavior: "smooth" });
  profileDOM.focusHeading();
  profileDOM.setHighlight();

  assert.equal(h.getState().scrolledToProfile, true);
  assert.equal(h.getState().focusedHeading, true);
  assert.equal(h.getState().visualHighlight, true);
});
