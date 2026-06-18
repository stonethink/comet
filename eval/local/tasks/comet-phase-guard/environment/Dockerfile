FROM python:3.12-slim

WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir pyyaml

# Copy the wordcount code
COPY environment/wordcount.py /workspace/wordcount.py

# Create a pre-existing change in "design" phase
RUN mkdir -p openspec/changes/add-sorting

# Pre-populate .comet.yaml in design phase
COPY environment/.comet.yaml /workspace/openspec/changes/add-sorting/.comet.yaml

# Pre-populate proposal.md
COPY environment/proposal.md /workspace/openspec/changes/add-sorting/proposal.md

# Pre-populate tasks.md
COPY environment/tasks.md /workspace/openspec/changes/add-sorting/tasks.md

CMD ["bash"]
