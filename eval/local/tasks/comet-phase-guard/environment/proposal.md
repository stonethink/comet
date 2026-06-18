# Proposal: Add Sorting Feature

## Summary
Add a `--sort` flag to wordcount.py that sorts output lines alphabetically.

## Motivation
Users want to process word count output in a deterministic order for diffing and logging.

## Requirements
- Add `--sort` CLI flag
- When enabled, sort output lines alphabetically
- Works with `--lines` flag
