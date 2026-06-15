import { promises as fs } from 'fs';
import path from 'path';
import { parse } from 'yaml';
import type {
  BundleCapability,
  BundleHookDefinition,
  BundleManifest,
  BundlePlatformOverride,
  BundleRuleDefinition,
  BundleScriptDefinition,
  BundleSkillDefinition,
  SkillBundle,
} from './types.js';

type YamlObject = Record<string, unknown>;

const CAPABILITIES = ['skills', 'rules', 'hooks', 'scripts', 'references', 'assets'] as const;
const SKILL_VISIBILITIES = ['entry', 'internal'] as const;
const RULE_MODES = ['always', 'matched'] as const;
const SIDE_EFFECTS = ['none', 'read', 'write', 'external'] as const;
const SCRIPT_RUNTIMES = ['node', 'bash', 'python'] as const;

function invalidDocument(filePath: string, fieldPath: string, message: string): Error {
  return new Error(`${filePath}: ${fieldPath} ${message}`);
}

function assertObject(
  value: unknown,
  filePath: string,
  fieldPath = 'document',
): asserts value is YamlObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidDocument(filePath, fieldPath, 'must be an object');
  }
}

function assertArray(
  value: unknown,
  filePath: string,
  fieldPath: string,
): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw invalidDocument(filePath, fieldPath, 'must be an array');
  }
}

function assertString(
  value: unknown,
  filePath: string,
  fieldPath: string,
): asserts value is string {
  if (typeof value !== 'string') {
    throw invalidDocument(filePath, fieldPath, 'must be a string');
  }
}

function assertBoolean(
  value: unknown,
  filePath: string,
  fieldPath: string,
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw invalidDocument(filePath, fieldPath, 'must be a boolean');
  }
}

function assertOptionalBoolean(
  document: YamlObject,
  field: string,
  filePath: string,
  objectPath: string,
): void {
  if (field in document) {
    assertBoolean(document[field], filePath, `${objectPath}.${field}`);
  }
}

function assertOptionalNumber(
  document: YamlObject,
  field: string,
  filePath: string,
  objectPath: string,
): void {
  if (
    field in document &&
    (typeof document[field] !== 'number' || !Number.isFinite(document[field]))
  ) {
    throw invalidDocument(filePath, `${objectPath}.${field}`, 'must be a finite number');
  }
}

function assertOptionalString(
  document: YamlObject,
  field: string,
  filePath: string,
  objectPath: string,
): void {
  if (field in document) {
    assertString(document[field], filePath, `${objectPath}.${field}`);
  }
}

function assertEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  filePath: string,
  fieldPath: string,
): asserts value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw invalidDocument(filePath, fieldPath, `must be one of ${values.join(', ')}`);
  }
}

function stringArray(value: unknown, filePath: string, fieldPath: string): string[] {
  assertArray(value, filePath, fieldPath);
  return value.map((entry, index) => {
    assertString(entry, filePath, `${fieldPath}[${index}]`);
    return entry;
  });
}

function optionalArray(
  document: YamlObject,
  field: string,
  filePath: string,
  objectPath: string,
): unknown[] {
  if (!(field in document)) return [];
  assertArray(document[field], filePath, `${objectPath}.${field}`);
  return document[field];
}

function normalizeResourcePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function narrowSkill(value: unknown, filePath: string, index: number): BundleSkillDefinition {
  const fieldPath = `skills[${index}]`;
  assertObject(value, filePath, fieldPath);
  assertString(value.id, filePath, `${fieldPath}.id`);
  assertString(value.path, filePath, `${fieldPath}.path`);
  assertEnum(value.visibility, SKILL_VISIBILITIES, filePath, `${fieldPath}.visibility`);
  return {
    id: value.id,
    path: normalizeResourcePath(value.path),
    visibility: value.visibility,
  };
}

function narrowRule(value: unknown, filePath: string, index: number): BundleRuleDefinition {
  const fieldPath = `resources.rules[${index}]`;
  assertObject(value, filePath, fieldPath);
  assertString(value.id, filePath, `${fieldPath}.id`);
  assertString(value.path, filePath, `${fieldPath}.path`);
  assertEnum(value.mode, RULE_MODES, filePath, `${fieldPath}.mode`);
  assertBoolean(value.required, filePath, `${fieldPath}.required`);
  assertOptionalNumber(value, 'priority', filePath, fieldPath);
  const match =
    'match' in value ? stringArray(value.match, filePath, `${fieldPath}.match`) : undefined;
  return {
    id: value.id,
    path: normalizeResourcePath(value.path),
    mode: value.mode,
    ...(match ? { match } : {}),
    ...(typeof value.priority === 'number' ? { priority: value.priority } : {}),
    required: value.required,
  };
}

function narrowHook(value: unknown, filePath: string, index: number): BundleHookDefinition {
  const fieldPath = `resources.hooks[${index}]`;
  assertObject(value, filePath, fieldPath);
  assertString(value.id, filePath, `${fieldPath}.id`);
  assertString(value.path, filePath, `${fieldPath}.path`);
  return { id: value.id, path: normalizeResourcePath(value.path) };
}

function narrowScript(value: unknown, filePath: string, index: number): BundleScriptDefinition {
  const fieldPath = `resources.scripts[${index}]`;
  assertObject(value, filePath, fieldPath);
  assertString(value.id, filePath, `${fieldPath}.id`);
  assertString(value.path, filePath, `${fieldPath}.path`);
  assertEnum(value.sideEffect, SIDE_EFFECTS, filePath, `${fieldPath}.sideEffect`);
  assertEnum(value.runtime, SCRIPT_RUNTIMES, filePath, `${fieldPath}.runtime`);
  assertOptionalBoolean(value, 'requiresConfirmation', filePath, fieldPath);
  return {
    id: value.id,
    path: normalizeResourcePath(value.path),
    sideEffect: value.sideEffect,
    runtime: value.runtime,
    ...(typeof value.requiresConfirmation === 'boolean'
      ? { requiresConfirmation: value.requiresConfirmation }
      : {}),
  };
}

function narrowCapabilityArray(
  value: unknown,
  filePath: string,
  fieldPath: string,
): BundleCapability[] {
  assertArray(value, filePath, fieldPath);
  return value.map((entry, index) => {
    assertEnum(entry, CAPABILITIES, filePath, `${fieldPath}[${index}]`);
    return entry;
  });
}

function narrowOverride(value: unknown, filePath: string, index: number): BundlePlatformOverride {
  const fieldPath = `platforms.overrides[${index}]`;
  assertObject(value, filePath, fieldPath);
  assertString(value.platform, filePath, `${fieldPath}.platform`);
  assertString(value.replaces, filePath, `${fieldPath}.replaces`);
  assertString(value.path, filePath, `${fieldPath}.path`);
  return {
    platform: value.platform,
    replaces: value.replaces,
    path: normalizeResourcePath(value.path),
  };
}

function narrowManifest(document: unknown, filePath: string): BundleManifest {
  assertObject(document, filePath);
  assertEnum(document.apiVersion, ['comet/v1alpha1'], filePath, 'apiVersion');
  assertEnum(document.kind, ['SkillBundle'], filePath, 'kind');

  assertObject(document.metadata, filePath, 'metadata');
  assertString(document.metadata.name, filePath, 'metadata.name');
  assertString(document.metadata.version, filePath, 'metadata.version');
  assertString(document.metadata.description, filePath, 'metadata.description');
  assertString(document.metadata.defaultLocale, filePath, 'metadata.defaultLocale');
  const locales = stringArray(document.metadata.locales, filePath, 'metadata.locales');

  assertArray(document.skills, filePath, 'skills');
  const skills = document.skills.map((entry, index) => narrowSkill(entry, filePath, index));

  const resourcesValue = document.resources ?? {};
  assertObject(resourcesValue, filePath, 'resources');
  const resources = {
    rules: optionalArray(resourcesValue, 'rules', filePath, 'resources').map((entry, index) =>
      narrowRule(entry, filePath, index),
    ),
    hooks: optionalArray(resourcesValue, 'hooks', filePath, 'resources').map((entry, index) =>
      narrowHook(entry, filePath, index),
    ),
    references: optionalArray(resourcesValue, 'references', filePath, 'resources').map(
      (entry, index) => {
        assertString(entry, filePath, `resources.references[${index}]`);
        return normalizeResourcePath(entry);
      },
    ),
    scripts: optionalArray(resourcesValue, 'scripts', filePath, 'resources').map((entry, index) =>
      narrowScript(entry, filePath, index),
    ),
    assets: optionalArray(resourcesValue, 'assets', filePath, 'resources').map((entry, index) => {
      assertString(entry, filePath, `resources.assets[${index}]`);
      return normalizeResourcePath(entry);
    }),
  };

  const platformsValue = document.platforms ?? {};
  assertObject(platformsValue, filePath, 'platforms');
  const platforms = {
    requires:
      'requires' in platformsValue
        ? narrowCapabilityArray(platformsValue.requires, filePath, 'platforms.requires')
        : [],
    optional:
      'optional' in platformsValue
        ? narrowCapabilityArray(platformsValue.optional, filePath, 'platforms.optional')
        : [],
    overrides: optionalArray(platformsValue, 'overrides', filePath, 'platforms').map(
      (entry, index) => narrowOverride(entry, filePath, index),
    ),
  };

  const engineValue = document.engine ?? { enabled: false };
  assertObject(engineValue, filePath, 'engine');
  assertBoolean(engineValue.enabled, filePath, 'engine.enabled');
  assertOptionalString(engineValue, 'path', filePath, 'engine');

  return {
    apiVersion: document.apiVersion,
    kind: document.kind,
    metadata: {
      name: document.metadata.name,
      version: document.metadata.version,
      description: document.metadata.description,
      defaultLocale: document.metadata.defaultLocale,
      locales,
    },
    skills,
    resources,
    platforms,
    engine: {
      enabled: engineValue.enabled,
      ...(typeof engineValue.path === 'string'
        ? { path: normalizeResourcePath(engineValue.path) }
        : {}),
    },
  };
}

async function readYaml(filePath: string): Promise<unknown> {
  const source = await fs.readFile(filePath, 'utf8');
  try {
    return parse(source) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw invalidDocument(filePath, 'document', message);
  }
}

export async function loadBundle(root: string): Promise<SkillBundle> {
  const bundleRoot = path.resolve(root);
  const manifestPath = path.join(bundleRoot, 'bundle.yaml');
  return {
    root: bundleRoot,
    manifest: narrowManifest(await readYaml(manifestPath), manifestPath),
  };
}
