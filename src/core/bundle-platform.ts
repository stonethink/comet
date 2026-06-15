import path from 'path';
import type {
  BundleCapability,
  BundleCompilerIr,
  ExecutableDisclosure,
  PlatformInstallFile,
} from '../bundle/types.js';
import { computeRuleDestPath } from './skills.js';
import { getPlatformSkillsDir, PLATFORMS, type Platform } from './platforms.js';

export interface PlatformBundleLayout {
  platform: string;
  scope: 'project' | 'global';
  skillsRoot: string;
  rulesRoot: string | null;
  hooksSupported: boolean;
  scriptsRoot: string | null;
}

export interface BundlePlatformTarget {
  id: string;
  name: string;
  platform: Platform;
  layout: PlatformBundleLayout;
  capabilities: ReadonlySet<BundleCapability>;
}

function rulesRoot(
  platform: Platform,
  baseDir: string,
  scope: 'project' | 'global',
): string | null {
  if (!platform.rulesDir || !platform.rulesFormat) return null;
  const rulesBase =
    platform.rulesBaseDir !== undefined
      ? platform.rulesBaseDir === ''
        ? baseDir
        : path.join(baseDir, platform.rulesBaseDir)
      : path.join(baseDir, getPlatformSkillsDir(platform, scope));
  return path.join(rulesBase, platform.rulesDir);
}

export function listBundlePlatformTargets(options: {
  projectRoot: string;
  homeDir: string;
  scope: 'project' | 'global';
}): BundlePlatformTarget[] {
  const baseDir = options.scope === 'global' ? options.homeDir : options.projectRoot;
  return PLATFORMS.map((platform) => {
    const platformRoot = path.join(baseDir, getPlatformSkillsDir(platform, options.scope));
    const capabilities = new Set<BundleCapability>(['skills', 'scripts', 'references', 'assets']);
    if (platform.rulesDir && platform.rulesFormat) capabilities.add('rules');
    if (platform.supportsHooks && platform.hookFormat) capabilities.add('hooks');
    return {
      id: platform.id,
      name: platform.name,
      platform,
      layout: {
        platform: platform.id,
        scope: options.scope,
        skillsRoot: path.join(platformRoot, 'skills'),
        rulesRoot: rulesRoot(platform, baseDir, options.scope),
        hooksSupported: capabilities.has('hooks'),
        scriptsRoot: path.join(platformRoot, 'skills', '.comet-bundles'),
      },
      capabilities,
    };
  });
}

export function planBundleRule(
  target: BundlePlatformTarget,
  rule: BundleCompilerIr['rules'][number],
): PlatformInstallFile[] {
  const format = target.platform.rulesFormat;
  if (!target.layout.rulesRoot || !format) return [];
  if (rule.mode === 'matched' && format === 'md') return [];
  return [
    {
      source: rule.source,
      destination: computeRuleDestPath(target.layout.rulesRoot, path.basename(rule.path), format),
      kind: 'rule',
      operation: {
        type: 'rule',
        format,
        mode: rule.mode,
        ...(rule.match ? { match: rule.match } : {}),
      },
    },
  ];
}

function hookDestination(target: BundlePlatformTarget, hookId: string): string | null {
  const platformRoot = path.dirname(target.layout.skillsRoot);
  switch (target.platform.hookFormat) {
    case 'claude-code':
      return path.join(platformRoot, 'settings.local.json');
    case 'qwen':
    case 'qoder':
    case 'gemini':
      return path.join(platformRoot, 'settings.json');
    case 'windsurf':
      return path.join(platformRoot, 'hooks.json');
    case 'copilot':
      return path.join(platformRoot, 'hooks', `${hookId}.json`);
    case 'kiro':
      return path.join(platformRoot, 'hooks', `${hookId}.kiro.hook`);
    default:
      return null;
  }
}

function scriptDestination(
  target: BundlePlatformTarget,
  bundleName: string,
  script: BundleCompilerIr['scripts'][number],
): string {
  return path.join(
    target.layout.scriptsRoot!,
    bundleName,
    ...script.path.replace(/^scripts\//, 'scripts/').split('/'),
  );
}

function scriptCommand(script: BundleCompilerIr['scripts'][number], destination: string): string {
  const executable =
    script.runtime === 'node' ? 'node' : script.runtime === 'python' ? 'python' : 'bash';
  return `${executable} ${destination}`;
}

export function planBundleHook(
  target: BundlePlatformTarget,
  hook: BundleCompilerIr['hooks'][number],
  scripts: BundleCompilerIr['scripts'],
  bundleName = 'bundle',
): {
  files: PlatformInstallFile[];
  disclosure: ExecutableDisclosure;
} | null {
  const format = target.platform.hookFormat;
  const destination = hookDestination(target, hook.id);
  if (!target.layout.hooksSupported || !format || !destination) return null;
  if (!['before_tool', 'before_write'].includes(hook.event)) return null;
  const script = scripts.find((item) => item.id === hook.script);
  if (!script || !target.layout.scriptsRoot) return null;
  const installedScript = scriptDestination(target, bundleName, script);
  const command = scriptCommand(script, installedScript);
  return {
    files: [
      {
        source: hook.source,
        destination,
        kind: 'hook',
        operation: {
          type: 'hook',
          format,
          event: hook.event,
          ...(hook.matcher ? { matcher: hook.matcher } : {}),
          command,
          failure: hook.failure,
          requiresConfirmation: hook.requiresConfirmation,
        },
      },
    ],
    disclosure: {
      id: hook.id,
      command,
      sideEffect: script.sideEffect,
      destination,
    },
  };
}

export function planBundleOverride(
  target: BundlePlatformTarget,
  override: BundleCompilerIr['overrides'][number],
  kind: PlatformInstallFile['kind'],
): PlatformInstallFile {
  const prefix = `overrides/${target.id}/`;
  const relative = override.path.startsWith(prefix)
    ? override.path.slice(prefix.length)
    : path.basename(override.path);
  return {
    source: override.source,
    destination: path.join(path.dirname(target.layout.skillsRoot), ...relative.split('/')),
    kind,
  };
}
