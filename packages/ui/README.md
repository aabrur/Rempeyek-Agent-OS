# @rempeyek/ui

**Live package.** React primitives shared by every view.

`Btn` · `Pill` · `Chip` · `Panel` · `Empty` · `Skeleton` · `SectionRow` · `PageHead` ·
`Overlay` (modals) · `Avatar`

Pure and stateless: no data fetching, no side effects. They render the
[`@rempeyek/design-system`](../design-system) class names rather than carrying their own
CSS, so a token change restyles everything at once and visual fidelity is guaranteed by
the stylesheet.

```jsx
import { Btn, Panel, Pill } from "@rempeyek/ui";

<Panel title="AGENT STATUS" chip="live">
  <Pill status="running" label="running · service" />
  <Btn variant="primary" onClick={start}>▶ Start</Btn>
</Panel>
```

`Btn variant`: `primary` · `run` · `stop` · `dim`.
`Pill status`: `running` · `working` · `waiting` · `idle` · `exited` · `error`.
