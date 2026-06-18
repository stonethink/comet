You are working on a Python project that already has a comet change in progress.

The change is called "add-sorting" and it's in the **design** phase. The proposal and tasks have been created, but the Design Doc hasn't been written yet.

**Your task**: Detect the current phase of the "add-sorting" change and continue the workflow from where it left off.

Specifically:
1. Read the `.comet.yaml` state file to detect the current phase
2. Check what artifacts already exist (proposal.md, tasks.md, etc.)
3. Continue the workflow from the design phase - create the Design Doc
4. After design is complete, proceed to build phase and implement a simple sorting feature
5. Verify the implementation works

The feature to implement: Add a `--sort` flag to wordcount.py that sorts output lines alphabetically.

Start by detecting the current phase using the comet workflow.
