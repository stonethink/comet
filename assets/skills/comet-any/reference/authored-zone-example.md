# Authored Zone Quality Bar (example)

This is a concrete quality bar for the **Authored zone** you write (`## Decision Core` for the entry, `## Guidance` for nodes). The generator composes your Authored zone onto a deterministic **Auto zone** (frontmatter, route table, Entry/Exit checks, evidence format, recovery). You write ONLY the Authored zone. Calibrate against this example, not against a one-line boilerplate node.

## What "Auto" vs "Authored" means

- **Auto zone (template, do not rewrite)**: the invariant control plane. For a node: `## Node Goal`, `## Entry Check`, `## Skill Implementation`, `## Required Skill Calls`, `## Output Schemas`, `## Evidence Record`, `## Guardrails`, `## Exit Check`, `## Recovery`. For the entry: `## Workflow Nodes`, `## Skill Bindings`, `## Guardrails And Evidence`, `## Runtime And Recovery`.
- **Authored zone (you write)**: the domain decisions the Auto zone cannot know. This is what makes the Skill usable, not just runnable.

## Example: a `substance` node Guidance zone (workflow-kernel)

This is the `## Guidance` body for a "Research" producer node in a research-writer workflow. Notice it is **decision content**: prerequisites, ordered domain steps, completion judgment beyond the mechanical Exit Check, and red flags. It references the bound Skill by name without copying its body.

```markdown
## Prerequisites

- The entry Decision Core has confirmed the research topic and scope.
- `research-skill` is resolvable in the project Skill pool; if missing, stop and ask the user before improvising.

## Steps

1. Load `research-skill` and follow its discovery method for the confirmed topic. Do not substitute a generic web search when the project Skill defines a specific source order.
2. Gather sources in priority order; for each source, capture origin, date, and the claim you will reuse. Reject sources that fail the project's credibility bar rather than noting them as "weak".
3. Distill findings into note files under `notes/*.md` — one note per distinct claim, with a verbatim quote and the source pointer. Synthesis happens in the writer node, not here.
4. Record the `research.notes.v1` `summary` evidence with a one-paragraph distillation and the count of notes produced.

## Completion reasoning

This node is complete ONLY when both hold: (a) the `summary` evidence is recorded, and (b) at least one artifact matches `notes/*.md`. Do not exit merely because the step list is exhausted — if notes are sparse relative to the topic scope, continue researching rather than declaring done. The Exit Check script enforces the artifact + evidence requirement mechanically; your job is to judge whether the research is genuinely sufficient.

## Red flags

- Exiting after recording `summary` but producing zero `notes/*.md` files (the guardrail will block this — do not attempt to bypass).
- Copying source text into notes without a quote marker or source pointer.
- Advancing to the Write node while a source is still "to be verified" — verification belongs in this node.
- Treating a single source as sufficient for a multi-perspective topic.
```

Use `###` subsections so they nest under `## Guidance`. The four sections above (Prerequisites / Steps / Completion reasoning / Red flags) are the expected shape for a `substance` node.

## substance vs delegates

- **substance** node (workflow-kernel): the example above is the bar. Rich Guidance is mandatory; without it the node renders `AUTHORING PENDING` and the Bundle cannot become ready.
- **delegates** node (comet-five-phase-overlay, delegating to an installed rich Skill): the delegate carries the execution richness, so do NOT duplicate it. But if the node declares **Required Skill Calls** (e.g. require `elementui` at the execute node), author a focused integration note — when, during the delegate's flow, the required Skill must be loaded and what evidence it adds — rather than a generic "load X" line. Example for a delegates execute node requiring `elementui`:

```markdown
This node runs `comet-build` for execution. In addition to that flow, load `elementui` whenever a change touches the component library, and confirm the change uses project-approved components before recording the `required-skill:execute.elementui` check. Do not re-implement what `comet-build` already does.
```

## Anti-patterns (do not write)

- A one-line Guidance like "Run this node and record evidence." — that is what the Auto zone already implies; it adds nothing.
- Copying the bound Skill's body verbatim.
- Restating the route table or the Output Schema list (already in the Auto zone).
- No `### Red flags` section on a substance node — red flags are where most of the real-world value lives.
