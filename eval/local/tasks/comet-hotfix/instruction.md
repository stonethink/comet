You are working on a Python project called "wordcount-cli" - a simple command-line word counting tool.

**Bug Report**: The `--lines` flag is broken. When counting lines, it counts words instead of lines.

Example of the bug:
```
$ echo -e "hello\nworld\nfoo" | python wordcount.py --lines
Words: 3
Lines: 3    # Bug: this shows 3 but should show 3 lines (correct in this case)
```

But with trailing newline:
```
$ echo "hello world foo bar" | python wordcount.py --lines
Words: 4
Lines: 4    # Bug: this counts words, not lines (should be 1 line)
```

**Your task**: Fix this bug using the comet hotfix workflow.

Since this is a simple single-file bug fix, use the hotfix preset:
1. Create a minimal change record
2. Fix the bug directly (skip brainstorming)
3. Verify the fix works
4. Archive the change

Start by detecting the current phase and following the comet hotfix workflow.
