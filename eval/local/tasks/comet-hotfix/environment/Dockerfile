FROM python:3.12-slim

WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir pyyaml

# Copy the buggy wordcount code
COPY environment/wordcount.py /workspace/wordcount.py

# Create openspec directory structure
RUN mkdir -p openspec/changes

CMD ["bash"]
