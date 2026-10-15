'use client';

/**
 * HowItWorks panel explains the InstallDoctor pipeline.
 *
 * BACKEND PIPELINE (service.py JobService.run):
 *   1. Clone → git clone --depth 1 the GitHub repo
 *   2. Inspect → inspection.py: parse manifests, trace imports, detect contracts
 *   3. Baseline → runner.py: install deps, pip check, pytest, probe contracts
 *   4. AI Propose → ai.py: send evidence to local model, get repair proposal
 *   5. Patch → patching.py: validate hashes, apply changes to candidate copy
 *   6. Verify → runner.py: run same checks on candidate, compare results
 *   7. Export → reporting.py: generate capsule.json, report.md, capsule.zip
 *
 *   For "analyze" mode, steps 4-6 are skipped.
 */

const STEPS = [
  {
    number: 1,
    title: 'Inspect',
    description:
      'Clone the repository, parse dependency manifests (requirements.txt, pyproject.toml), trace Python imports, and detect source-derived contracts.',
  },
  {
    number: 2,
    title: 'Establish Baseline',
    description:
      'Install dependencies, run pip check, execute pytest, and probe inferred contracts to record the original state.',
  },
  {
    number: 3,
    title: 'AI Diagnosis & Repair',
    description:
      'Send repository evidence and baseline results to a local AI model. Receive a structured repair proposal with file changes and reasoning.',
  },
  {
    number: 4,
    title: 'Verify & Report',
    description:
      'Apply proposed changes to a candidate copy, re-run all checks, compare against baseline, and export a Dependency Exit Capsule with full evidence.',
  },
];

export default function HowItWorks() {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">How It Works</h3>
      </div>
      <div className="how-it-works">
        <div className="how-steps">
          {STEPS.map((step) => (
            <div className="how-step" key={step.number}>
              <div className="how-step-number">{step.number}</div>
              <div className="how-step-content">
                <h4>{step.title}</h4>
                <p>{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
