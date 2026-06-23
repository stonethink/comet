import {
  bundleDistributeCommand,
  bundleListCommand,
  bundlePublishCommand,
  bundleReviewCommand,
  bundleReviewSummaryCommand,
  bundleStatusCommand,
  type BundleCommandOptions,
} from './bundle.js';

export type PublishCommandOptions = BundleCommandOptions;

export async function publishListCommand(options: PublishCommandOptions = {}): Promise<void> {
  await bundleListCommand(options);
}

export async function publishStatusCommand(
  name: string,
  options: PublishCommandOptions = {},
): Promise<void> {
  await bundleStatusCommand(name, options);
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
