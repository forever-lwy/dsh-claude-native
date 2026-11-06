import type Anthropic from '@anthropic-ai/sdk';
import { type ClaudeModelConfig } from './config.js';
export interface DiscoveredClaudeModel extends ClaudeModelConfig {
    name: string;
}
/**
 * Derive selectable thinking levels from the live capability tree. A known
 * model id keeps its verified preset (which also knows how "off" is spelled);
 * only capacities the API reports override it.
 */
export declare function describeModel(raw: Record<string, unknown>): DiscoveredClaudeModel | undefined;
export declare function discoverClaudeModels(client: Anthropic, signal: AbortSignal): Promise<DiscoveredClaudeModel[]>;
