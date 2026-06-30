import {
  bundleDistributeCommand,
  bundleListCommand,
  bundlePublishCommand,
  bundleReviewCommand,
  bundleReviewSummaryCommand,
  bundleStatusCommand,
  type BundleCommandOptions,
} from './bundle.js';
import path from 'path';
import { buildBundleResumeSummary } from '../../domains/bundle/next-action.js';
import { reconcileBundleAuthoringState } from '../../domains/bundle/state.js';
import { readProjectSkillPreferences } from '../../domains/skill/preferences.js';

export type PublishCommandOptions = BundleCommandOptions;

function projectRoot(options: PublishCommandOptions): string {
  return path.resolve(options.project ?? '.');
}

function formatNextText(result: Awaited<ReturnType<typeof buildPublishNextResult>>): string {
  return [
    `Next step for ${result.name}`,
    `Status: ${result.status}`,
    `Current step: ${result.currentStep}`,
    `Action: ${result.nextStep.label}`,
    `Command: ${result.nextStep.command}`,
    `Reason: ${result.nextStep.reason}`,
    `Requires confirmation: ${result.nextStep.requiresUserConfirmation ? 'yes' : 'no'}`,
    ...(result.preferenceDrift.changed
      ? ['Preference drift: project Skill preferences changed after this flow started']
      : []),
  ].join('\n');
}

async function buildPublishNextResult(name: string, options: PublishCommandOptions) {
  const root = projectRoot(options);
  const state = await reconcileBundleAuthoringState(root, name);
  const currentPreferences = await readProjectSkillPreferences(root);
  const resumeSummary = buildBundleResumeSummary(state, {
    currentPreferenceHash: currentPreferences?.hash ?? null,
  });
  const nextAction = resumeSummary.recommendedNextStep;

  return {
    schemaVersion: 1 as const,
    name: state.name,
    status: state.status,
    currentStep: resumeSummary.currentStep,
    nextStep: {
      action: nextAction.action,
      category: nextAction.category,
      label: nextAction.userLabel,
      command: nextAction.userCommand,
      reason: nextAction.reason,
      requiresUserConfirmation: nextAction.requiresUserConfirmation,
    },
    evidencePaths: resumeSummary.evidencePaths,
    preferenceDrift: resumeSummary.preferenceDrift,
  };
}

export async function publishListCommand(options: PublishCommandOptions = {}): Promise<void> {
  await bundleListCommand(options);
}

export async function publishStatusCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleStatusCommand(name, options);
}

export async function publishNextCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  const result = await buildPublishNextResult(name, options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatNextText(result));
}

export async function publishReviewCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleReviewSummaryCommand(name, options);
}

export async function publishApproveCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleReviewCommand(name, { ...options, approve: true, reject: false });
}

export async function publishRunCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundlePublishCommand(name, options);
}

export async function publishDistributeCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleDistributeCommand(name, options);
}
