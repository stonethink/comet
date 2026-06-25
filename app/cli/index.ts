import { Command, Option } from 'commander';
import { initCommand } from '../commands/init.js';
import { statusCommand } from '../commands/status.js';
import { dashboardCommand } from '../commands/dashboard.js';
import { doctorCommand } from '../commands/doctor.js';
import { evalCollectCommand, evalRunCommand } from '../commands/eval.js';
import { updateCommand } from '../commands/update.js';
import { uninstallCommand } from '../commands/uninstall.js';
import { getCurrentVersion } from '../../platform/version/version.js';
import {
  skillEvalCommand,
  skillInspectCommand,
  skillInstallCommand,
  skillResumeCommand,
  skillRunCommand,
  skillValidateCommand,
} from '../commands/skill.js';
import {
  publishApproveCommand,
  publishDistributeCommand,
  publishListCommand,
  publishReviewCommand,
  publishRunCommand,
  publishStatusCommand,
} from '../commands/publish.js';
import {
  bundleCandidatesCommand,
  bundleCompileCommand,
  bundleDistributeCommand,
  bundleDraftCreateCommand,
  bundleDraftOptimizeCommand,
  bundleEvalPlanCommand,
  bundleEvalRecordCommand,
  bundleFactoryGuideCommand,
  bundleFactoryGenerateCommand,
  bundleFactoryInitCommand,
  bundleFactoryProposeCommand,
  bundleFactoryResolveCommand,
  bundleListCommand,
  bundlePublishCommand,
  bundleReviewSummaryCommand,
  bundleReviewCommand,
  bundleStatusCommand,
} from '../commands/bundle.js';

const program = new Command();
const collect = (value: string, previous: string[]): string[] => [...previous, value];

program
  .name('comet')
  .description('Agent Skill Harness Phase-Guarded Automation From Idea To Archive')
  .version(getCurrentVersion());

program
  .command('init [path]')
  .description('Initialize Comet workflow in your project')
  .option('--yes', 'Auto-install missing components, skip existing')
  .option('--skip-existing', 'Never overwrite existing components')
  .option('--overwrite', 'Overwrite manifest-managed files')
  .option('--json', 'Output as JSON')
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .addOption(new Option('--language <lang>', 'Language for skills').choices(['en', 'zh']))
  .action(async (targetPath = '.', options) => {
    try {
      await initCommand(targetPath, options);
    } catch (error) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('\n  Cancelled.\n');
        process.exit(0);
      }
      throw error;
    }
  });

program
  .command('status [path]')
  .description('Show active changes and workflow status')
  .option('--json', 'Output as JSON')
  .action(async (targetPath = '.', options) => {
    await statusCommand(targetPath, options);
  });

program
  .command('dashboard [path]')
  .description('Launch the local Comet dashboard in your browser')
  .option('--port <port>', 'HTTP port to bind (default 4321, auto-bumps if busy)', (value) => {
    if (!/^\d+$/u.test(value)) {
      throw new Error(`Invalid --port value: "${value}". Use an integer between 0 and 65535.`);
    }
    return Number.parseInt(value, 10);
  })
  .option('--no-open', "Don't open the dashboard URL in the browser automatically")
  .option('--json', 'Print a single dashboard snapshot to stdout and exit')
  .action(async (targetPath = '.', options) => {
    await dashboardCommand(targetPath, options);
  });

program
  .command('doctor [path]')
  .description('Diagnose Comet installation health')
  .option('--json', 'Output as JSON')
  .addOption(
    new Option('--scope <scope>', 'Install scope to diagnose').choices([
      'auto',
      'global',
      'project',
    ]),
  )
  .action(async (targetPath = '.', options) => {
    await doctorCommand(targetPath, options);
  });

program
  .command('update [path]')
  .description('Update comet skill files to latest version')
  .option('--json', 'Output as JSON')
  .addOption(new Option('--language <lang>', 'Language for skills').choices(['en', 'zh']))
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .addOption(new Option('--skip-npm', 'Skip npm package self-update').hideHelp())
  .action(async (targetPath = '.', options) => {
    await updateCommand(targetPath, options);
  });

program
  .command('uninstall [path]')
  .description('Remove Comet skills, rules, and hooks from your project or global scope')
  .option('--json', 'Output as JSON')
  .addOption(new Option('--scope <scope>', 'Uninstall scope').choices(['global', 'project']))
  .option('--force', 'Skip confirmation prompts')
  .action(async (targetPath = '.', options) => {
    try {
      await uninstallCommand(targetPath, options);
    } catch (error) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('\n  Cancelled.\n');
        process.exit(0);
      }
      throw error;
    }
  });

const evalCommand = program
  .command('eval')
  .description('Run Comet Skill evals through the shared harness');

evalCommand
  .command('run')
  .description('Run a local Skill or eval manifest through the local eval suite')
  .option('--project <dir>', 'Repository root that contains eval/', '.')
  .option('--manifest <path>', 'Path to comet/eval.yaml')
  .option('--skill-path <path>', 'Local Skill directory or SKILL.md')
  .option('--skill-name <name>', 'Skill name used with --skill-path')
  .option('--profile <name>', 'Eval profile override')
  .option('--task <task>', 'Explicit eval task override')
  .option('--report-config <path>', 'JSON/YAML report output config')
  .option('--html', 'Enable HTML report output')
  .option('--quick', 'Use the default quick smoke task where applicable')
  .action(async (options) => {
    await evalRunCommand(options);
  });

evalCommand
  .command('collect')
  .description('Collect eval targets without executing Claude or Docker workloads')
  .option('--project <dir>', 'Repository root that contains eval/', '.')
  .option('--manifest <path>', 'Path to comet/eval.yaml')
  .option('--skill-path <path>', 'Local Skill directory or SKILL.md')
  .option('--skill-name <name>', 'Skill name used with --skill-path')
  .option('--profile <name>', 'Eval profile override')
  .option('--task <task>', 'Explicit eval task override')
  .action(async (options) => {
    await evalCollectCommand(options);
  });

const skill = program
  .command('skill')
  .description('Low-level Skill utilities for inspecting and running Engine-native packages');

skill
  .command('install <path>')
  .description('Install a Comet Skill into the project Skill pool')
  .option('--project <dir>', 'Project root', '.')
  .option('--overwrite', 'Replace an existing project Skill')
  .option('--json', 'Output as JSON')
  .action(async (source, options) => {
    await skillInstallCommand(source, options);
  });

skill
  .command('validate <skill>')
  .description('Validate a Comet Skill package')
  .option('--project <dir>', 'Project root used for Skill discovery', '.')
  .option('--json', 'Output as JSON')
  .action(async (selector, options) => {
    await skillValidateCommand(selector, options);
  });

skill
  .command('inspect <skill>')
  .description('Inspect a Comet Skill package')
  .option('--project <dir>', 'Project root used for Skill discovery', '.')
  .option('--json', 'Output as JSON')
  .action(async (selector, options) => {
    await skillInspectCommand(selector, options);
  });

skill
  .command('run <skill>')
  .description('Start a deterministic Comet Skill Run')
  .option('--change <dir>', 'Change directory that owns the Run')
  .option('--run-id <id>', 'Standalone Run id stored under .comet/runs/<id>')
  .option('--project <dir>', 'Project root used for Skill discovery', '.')
  .option('--confirm <ref>', 'Confirm a guarded reference', collect, [])
  .option('--json', 'Output as JSON')
  .action(async (selector, options) => {
    await skillRunCommand(selector, options);
  });

skill
  .command('resume')
  .description('Resume a Comet Skill Run or submit its pending action outcome')
  .option('--change <dir>', 'Change directory that owns the Run')
  .option('--run-id <id>', 'Standalone Run id stored under .comet/runs/<id>')
  .option('--project <dir>', 'Project root used for Skill discovery', '.')
  .addOption(
    new Option('--status <status>', 'Pending action outcome').choices(['succeeded', 'failed']),
  )
  .option('--summary <text>', 'Outcome summary')
  .option('--artifact <key=value>', 'Merge an artifact reference', collect, [])
  .option('--state <key=value>', 'Record outcome state evidence', collect, [])
  .option('--confirm <ref>', 'Confirm a guarded reference', collect, [])
  .option('--upgrade <skill>', 'Upgrade the Run to a compatible Skill snapshot')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await skillResumeCommand(options);
  });

skill
  .command('eval')
  .description(
    'Evaluate deterministic Engine Run runtime checks. Use comet eval run for general Skill evals',
  )
  .option('--change <dir>', 'Change directory that owns the Run')
  .option('--run-id <id>', 'Standalone Run id stored under .comet/runs/<id>')
  .option('--project <dir>', 'Project root used for standalone Run lookup', '.')
  .addOption(
    new Option('--scope <scope>', 'Runtime eval scope')
      .choices(['progress', 'step', 'completion'])
      .default('progress'),
  )
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await skillEvalCommand(options);
  });

const publish = program
  .command('publish')
  .description('Skill publish candidates for the /comet-any user-facing release path');

publish
  .command('list')
  .description('List Skill Maker candidates that can be resumed')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await publishListCommand(options);
  });

publish
  .command('status <name>')
  .description('Show validation readiness and next action for one Skill Maker candidate')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await publishStatusCommand(name, options);
  });

publish
  .command('review <name>')
  .description('Build a validation summary before approval')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--platform <id>', 'Reference platform id')
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .option('--locale <locale>', 'Locale to compile')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await publishReviewCommand(name, options);
  });

publish
  .command('approve <name>')
  .description('Approve a Skill Maker candidate after validation')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--reviewer <name>', 'Reviewer name')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await publishApproveCommand(name, options);
  });

publish
  .command('run <name>')
  .description('Generate an install candidate into .comet/bundles')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--platform <id>', 'Reference platform id')
  .option('--overwrite', 'Replace an existing published Bundle')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await publishRunCommand(name, options);
  });

publish
  .command('distribute <name>')
  .description('Preview or install a generated Skill Maker candidate')
  .option('--project <dir>', 'Project root', '.')
  .option('--platform <id>', 'Platform id', collect, [])
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .option('--locale <locale>', 'Locale to distribute')
  .option('--overwrite', 'Overwrite existing target files')
  .option(
    '--skip-capability <capability>',
    'Explicitly skip an unsupported optional capability',
    collect,
    [],
  )
  .option('--confirm-executables', 'Confirm executable hook/script disclosures')
  .option('--preview', 'Preview platform writes without installing files')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await publishDistributeCommand(name, options);
  });

const bundle = program
  .command('bundle')
  .description('Advanced Bundle backend for /comet-any Skill Maker state and audits');

bundle
  .command('candidates')
  .description('Discover Skill candidates for Bundle authoring')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await bundleCandidatesCommand(options);
  });

const draft = bundle.command('draft').description('Manage Bundle drafts');

draft
  .command('create <name>')
  .description('Create an empty Bundle draft')
  .option('--project <dir>', 'Project root', '.')
  .addOption(new Option('--default-locale <locale>', 'Default locale').default('en'))
  .option('--locale-option <locale>', 'Supported locale', collect, [])
  .option('--engine', 'Enable optional Engine metadata')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleDraftCreateCommand(name, options);
  });

draft
  .command('optimize <bundle>')
  .description('Create an optimization draft from an existing Bundle root')
  .option('--project <dir>', 'Project root', '.')
  .option('--name <name>', 'Override draft name')
  .option('--json', 'Output as JSON')
  .action(async (source, options) => {
    await bundleDraftOptimizeCommand(source, options);
  });

bundle
  .command('list')
  .description('List recoverable Bundle authoring states')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await bundleListCommand(options);
  });

bundle
  .command('status <name>')
  .description('Show Bundle authoring status')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleStatusCommand(name, options);
  });

bundle
  .command('factory-guide')
  .description('Summarize /comet-any first-use, preferences, and resumable Factory flows')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await bundleFactoryGuideCommand(options);
  });

bundle
  .command('factory-propose <name>')
  .description('Preview a /comet-any Factory proposal without writing Bundle state')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--file <path>', 'Factory plan JSON file')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleFactoryProposeCommand(name, options);
  });

bundle
  .command('factory-init <name>')
  .description('Initialize or update Bundle factory metadata from a structured plan file')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--file <path>', 'Factory plan JSON file')
  .option('--confirmed-proposal', 'Record that the user approved the Factory proposal')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleFactoryInitCommand(name, options);
  });

bundle
  .command('factory-generate <name>')
  .description('Generate Bundle draft source from stored factory metadata')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleFactoryGenerateCommand(name, options);
  });

bundle
  .command('factory-resolve <name>')
  .description('Resolve a missing or ambiguous Bundle factory Skill candidate')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--candidate <query>', 'Factory candidate query')
  .option('--source <root-or-hash>', 'Selected source root or exact source hash')
  .option('--ignore-missing', 'Ignore a missing preference and remove it from the call chain')
  .option('--reason <text>', 'Reason for ignoring a missing preference')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleFactoryResolveCommand(name, options);
  });

bundle
  .command('compile <name>')
  .description('Dry-run compile a Bundle for one platform')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--platform <id>', 'Platform id')
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .option('--locale <locale>', 'Locale to compile')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleCompileCommand(name, options);
  });

bundle
  .command('eval-plan <name>')
  .description('Estimate Bundle Eval work')
  .option('--project <dir>', 'Project root', '.')
  .addOption(
    new Option('--level <level>', 'Eval level').choices(['quick', 'full']).default('quick'),
  )
  .option('--locale <locale>', 'Locale to compile')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleEvalPlanCommand(name, options);
  });

bundle
  .command('eval-record <name>')
  .description('Record structured Bundle Eval evidence')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--result <file>', 'Eval result JSON')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleEvalRecordCommand(name, options);
  });

bundle
  .command('review-summary <name>')
  .description('Build a Bundle review summary before approval')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--platform <id>', 'Reference platform id')
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .option('--locale <locale>', 'Locale to compile')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleReviewSummaryCommand(name, options);
  });

bundle
  .command('review <name>')
  .description('Approve or reject a Bundle for publishing')
  .option('--project <dir>', 'Project root', '.')
  .option('--approve', 'Approve the Bundle')
  .option('--reject', 'Reject the Bundle')
  .requiredOption('--reviewer <name>', 'Reviewer name')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleReviewCommand(name, options);
  });

bundle
  .command('publish <name>')
  .description('Publish an approved Bundle into .comet/bundles')
  .option('--project <dir>', 'Project root', '.')
  .requiredOption('--platform <id>', 'Reference platform id')
  .option('--overwrite', 'Replace an existing published Bundle')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundlePublishCommand(name, options);
  });

bundle
  .command('distribute <name>')
  .description('Install a ready Bundle across selected platforms')
  .option('--project <dir>', 'Project root', '.')
  .option('--platform <id>', 'Platform id', collect, [])
  .addOption(new Option('--scope <scope>', 'Install scope').choices(['global', 'project']))
  .option('--locale <locale>', 'Locale to distribute')
  .option('--overwrite', 'Overwrite existing target files')
  .option(
    '--skip-capability <capability>',
    'Explicitly skip an unsupported optional capability',
    collect,
    [],
  )
  .option('--confirm-executables', 'Confirm executable hook/script disclosures')
  .option('--preview', 'Preview platform writes without installing files')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleDistributeCommand(name, options);
  });

program.parse();
