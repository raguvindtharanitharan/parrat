import type { Playbook } from '../core/playbooks/Playbook.js';
import { freshnessInvestigationPlaybook } from './freshness-investigation/index.js';
import { lineageAnalysisPlaybook } from './lineage-analysis/index.js';
import { metricDropRcaPlaybook } from './metric-drop-rca/index.js';

export const playbooks: readonly Playbook[] = [
  freshnessInvestigationPlaybook,
  metricDropRcaPlaybook,
  lineageAnalysisPlaybook,
];
