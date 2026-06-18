import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Document, parseDocument } from 'yaml';
import {
  CLASSIC_WIRE_KEYS,
  RUN_WIRE_KEYS,
  classicStateToDocument,
  parseClassicStateDocument,
  readLegacyStateSummary,
  type ClassicStateProjection,
  type LegacyStateSummary,
} from './classic-state.js';
import { applyRunStateToDocument, type StateDocument } from '../engine/state.js';

function documentRecord(document: Document): StateDocument {
  const value = document.toJS() as unknown;
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Classic state document: root must be a mapping');
  }
  return value as StateDocument;
}

function setIfChanged(document: Document, key: string, value: unknown): void {
  if (document.get(key) !== value) document.set(key, value);
}

function applyProjection(document: Document, projection: ClassicStateProjection): void {
  if (projection.classic) {
    for (const [key, value] of Object.entries(classicStateToDocument(projection.classic))) {
      setIfChanged(document, key, value);
    }
  } else {
    for (const key of CLASSIC_WIRE_KEYS) document.delete(key);
  }

  if (projection.run) {
    const runDocument: StateDocument = {};
    applyRunStateToDocument(runDocument, projection.run);
    for (const [key, value] of Object.entries(runDocument)) {
      setIfChanged(document, key, value);
    }
  } else {
    for (const key of RUN_WIRE_KEYS) document.delete(key);
  }
}

async function readDocument(file: string): Promise<Document> {
  let source: string;
  try {
    source = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return new Document({});
  }

  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(`Invalid Classic state document: ${document.errors[0].message}`);
  }
  documentRecord(document);
  return document;
}

export async function readClassicState(changeDir: string): Promise<ClassicStateProjection> {
  const document = await readDocument(path.join(changeDir, '.comet.yaml'));
  return parseClassicStateDocument(documentRecord(document));
}

export async function readLegacyState(changeDir: string): Promise<LegacyStateSummary> {
  const document = await readDocument(path.join(changeDir, '.comet.yaml'));
  return readLegacyStateSummary(documentRecord(document));
}

export async function writeClassicState(
  changeDir: string,
  projection: Omit<ClassicStateProjection, 'unknownKeys'> & { unknownKeys?: string[] },
): Promise<void> {
  const file = path.join(changeDir, '.comet.yaml');
  const document = await readDocument(file);
  applyProjection(document, {
    ...projection,
    unknownKeys: projection.unknownKeys ?? [],
  });

  parseClassicStateDocument(documentRecord(document));

  await fs.mkdir(changeDir, { recursive: true });
  const temporary = path.join(changeDir, `.comet.yaml.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, document.toString(), 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}
