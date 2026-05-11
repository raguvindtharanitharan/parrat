import type { Skill } from '../core/skills/Skill.js';
import { freshnessInvestigationSkill } from './freshness-investigation/index.js';
import { lineageAnalysisSkill } from './lineage-analysis/index.js';
import { metricDropRcaSkill } from './metric-drop-rca/index.js';

export const skills: readonly Skill[] = [
  freshnessInvestigationSkill,
  metricDropRcaSkill,
  lineageAnalysisSkill,
];
