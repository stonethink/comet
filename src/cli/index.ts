import { Command, Option } from 'commander';
import { createRequire } from 'module';
import { initCommand } from '../commands/init.js';
import { statusCommand } from '../commands/status.js';
import { doctorCommand } from '../commands/doctor.js';
import { updateCommand } from '../commands/update.js';
import { uninstallCommand } from '../commands/uninstall.js';
import {
  skillEvalCommand,
  skillInspectCommand,
  skillInstallCommand,
  skillResumeCommand,
  skillRunCommand,
  skillValidateCommand,
} from '../commands/skill.js';
import {
  bundleCandidatesCommand,
  bundleCompileCommand,
  bundleDistributeCommand,
  bundleDraftCreateCommand,
  bundleDraftOptimizeCommand,
  bundleEvalPlanCommand,
  bundleEvalRecordCommand,
  bundlePublishCommand,
  bundleReviewCommand,
  bundleStatusCommand,
} from '../commands/bundle.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const program = new Command();
const collect = (value: string, previous: string[]): string[] => [...previous, value];

program
  .name('comet')
  .description('Agent Skill Harness Phase-Guarded Automation From Idea To Archive')
  .version(version);

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

const skill = program.command('skill').description('Author and run Comet Skill packages');

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
  .requiredOption('--change <dir>', 'Change directory that owns the Run')
  .option('--project <dir>', 'Project root used for Skill discovery', '.')
  .option('--confirm <ref>', 'Confirm a guarded reference', collect, [])
  .option('--json', 'Output as JSON')
  .action(async (selector, options) => {
    await skillRunCommand(selector, options);
  });

skill
  .command('resume')
  .description('Resume a Comet Skill Run or submit its pending action outcome')
  .requiredOption('--change <dir>', 'Change directory that owns the Run')
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
  .description('Evaluate runtime checks against a Comet Skill Run')
  .requiredOption('--change <dir>', 'Change directory that owns the Run')
  .addOption(
    new Option('--scope <scope>', 'Runtime eval scope')
      .choices(['progress', 'step', 'completion'])
      .default('progress'),
  )
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await skillEvalCommand(options);
  });

const bundle = program.command('bundle').description('Create and distribute Comet Skill Bundles');

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
  .command('status <name>')
  .description('Show Bundle authoring status')
  .option('--project <dir>', 'Project root', '.')
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleStatusCommand(name, options);
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
  .option('--json', 'Output as JSON')
  .action(async (name, options) => {
    await bundleDistributeCommand(name, options);
  });

program.parse();
