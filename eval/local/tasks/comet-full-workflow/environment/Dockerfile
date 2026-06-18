FROM python:3.12-slim

WORKDIR /workspace

# Install basic tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq && \
    rm -rf /var/lib/apt/lists/*

# Install openspec CLI (mock - we just need the workflow structure)
RUN pip install --no-cache-dir pyyaml

# Create a sample project structure
RUN mkdir -p wordcount-cli && \
    echo '# Word Count CLI\nA simple word counting tool.' > wordcount-cli/README.md

# Copy the existing wordcount code
COPY environment/wordcount.py /workspace/wordcount.py
COPY environment/test_wordcount.py /workspace/test_wordcount.py

# Create openspec directory structure
RUN mkdir -p openspec/changes

CMD ["bash"]
