import { getGitHubToken } from './developer';

const REPOSITORY = 'shomratofficial007-spec/Badboy-VS-Versel-Ai';
const GITHUB_API = 'https://api.github.com';

export type RepositoryCheckStatus = 'verified' | 'not_connected' | 'failed';

export interface RepositoryEvidence {
  status: RepositoryCheckStatus;
  repository: string;
  defaultBranch?: string;
  checkedAt: string;
  filePaths: string[];
  note: string;
}

interface GitHubRepositoryResponse {
  default_branch?: string;
}

interface GitHubTreeResponse {
  truncated?: boolean;
  tree?: Array<{ path?: string; type?: string }>;
}

const SOURCE_FILE_PATTERN = /\.(tsx?|jsx?|json|toml|ya?ml|md)$/i;

export function selectRelevantRepositoryPaths(paths: string[], limit = 60): string[] {
  return paths
    .filter((path) => SOURCE_FILE_PATTERN.test(path))
    .filter((path) => !/(^|\/)(node_modules|\.git|dist|build|\.expo)(\/|$)/i.test(path))
    .sort((a, b) => {
      const score = (path: string) =>
        (/^(artifacts\/mobile\/app|functions\/|artifacts\/mobile\/lib\/assistant)/.test(path) ? 0 : 1);
      return score(a) - score(b) || a.localeCompare(b);
    })
    .slice(0, limit);
}

/**
 * Reads repository metadata and the Git tree only. It never reads file contents,
 * changes code, creates branches, or exposes the GitHub token to the AI prompt.
 */
export async function inspectBadboyRepository(): Promise<RepositoryEvidence> {
  const checkedAt = new Date().toISOString();
  const token = await getGitHubToken();
  if (!token) {
    return {
      status: 'not_connected',
      repository: REPOSITORY,
      checkedAt,
      filePaths: [],
      note: 'GitHub PAT is not connected; live repository verification was not performed.',
    };
  }

  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const repositoryResponse = await fetch(`${GITHUB_API}/repos/${REPOSITORY}`, { headers });
    if (!repositoryResponse.ok) throw new Error(`GitHub repository check failed (HTTP ${repositoryResponse.status}).`);
    const repository = await repositoryResponse.json() as GitHubRepositoryResponse;
    const defaultBranch = repository.default_branch || 'main';

    const treeResponse = await fetch(
      `${GITHUB_API}/repos/${REPOSITORY}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
      { headers },
    );
    if (!treeResponse.ok) throw new Error(`GitHub file tree check failed (HTTP ${treeResponse.status}).`);
    const tree = await treeResponse.json() as GitHubTreeResponse;
    const paths = (tree.tree ?? [])
      .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
      .map((entry) => entry.path as string);

    return {
      status: 'verified',
      repository: REPOSITORY,
      defaultBranch,
      checkedAt,
      filePaths: selectRelevantRepositoryPaths(paths),
      note: tree.truncated
        ? 'GitHub marked the recursive tree as truncated; this is a partial file inventory, not a complete scan.'
        : 'Repository metadata and file paths were checked live. File contents, runtime behavior, and CI results were not inspected.',
    };
  } catch (error) {
    return {
      status: 'failed',
      repository: REPOSITORY,
      checkedAt,
      filePaths: [],
      note: error instanceof Error ? error.message : 'GitHub repository verification failed.',
    };
  }
}

export function buildExpertReviewPrompt(
  pastedResponse: string,
  evidence: RepositoryEvidence,
  projectSummary: string,
): string {
  return [
    'You are Badboy Expert Review. Analyze the pasted assistant response as a technical proposal, capability claim, or code diagnosis.',
    'Reply in clear Bangla. Do not blindly agree with the pasted response.',
    'Separate VERIFIED FACTS, REASONED INFERENCES, and NOT YET VERIFIED items.',
    'Never claim that a file has a bug unless its contents were actually inspected. A file path alone is not code evidence.',
    'Do not claim tests passed, code changed, tools connected, or a PR created unless the supplied evidence proves it.',
    'Explain whether Badboy can do the requested task, what tools/APIs/permissions/credentials are needed, what already exists, likely files to inspect, a safe implementation sequence, test plan, and likely PR count.',
    'Do not expose, repeat, request, or include secrets, access tokens, passwords, or private credentials in the report.',
    'Do not create or modify code, branches, PRs, deployments, or external resources. This is analysis only.',
    '',
    'PROJECT CONTEXT (existing local architecture summary; may be stale):',
    projectSummary,
    '',
    'LIVE REPOSITORY EVIDENCE:',
    JSON.stringify(evidence, null, 2),
    '',
    'PASTED BADBOY RESPONSE / CODE / ERROR:',
    pastedResponse.trim(),
    '',
    'Use this report structure:',
    '1. সংক্ষিপ্ত সিদ্ধান্ত',
    '2. Badboy কি কাজটি করতে পারবে?',
    '3. আগে থেকেই যা আছে',
    '4. যা যা লাগবে (Tools / API / Permissions / Credentials)',
    '5. সম্ভাব্য সংশ্লিষ্ট ফাইল (প্রমাণের স্তর উল্লেখ করে)',
    '6. সমস্যা ও ঝুঁকি (Verified / Inference / Unknown আলাদা করে)',
    '7. ধাপে ধাপে সমাধান',
    '8. পরীক্ষা ও acceptance criteria',
    '9. PR পরিকল্পনা (সংখ্যা ও প্রতিটির scope)',
    '10. এখন ব্যবহারকারীর কাছ থেকে কী লাগবে',
  ].join('\n');
}
