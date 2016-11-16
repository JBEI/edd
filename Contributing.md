# Contributing Guidelines

1. Never work without first setting git name and email.
    * `git config --global user.email "user@example.org"`
    * `git config --global user.name "First Last"`
2. Run the `.gitconfig.sh` script in every local repo before pushing changes.
    * Prevents auto-generated comments in JavaScript from triggering diffs.
3. Code for the EDD community.
    * EDD is designed to be a generic tool helpful to a large community of users.
    * Prefer configuration for institution-specific requirements.
    * We encourage seeking feedback, to focus effort on what is important to the community.
4. All work shall occur in branches created from a JIRA ticket or GitHub Issue.
    * Submit a ticket or discuss new work with core contributors to get feedback on planned work.
    * Major changes should be discussed with core contributors first.
5. Changes to `master` and `release/*` branches must come through a pull request.
6. Changes to all other branches are encouraged to go through a pull request.
7. Prefer deleting source branch on merging a pull request, to keep the branch list manageable.
8. Prefer rebasing to keep branches up-to-date with changes to parent branch.
    * Merges will make the developer performing the merge the author of incoming changes.
    * Change in authorship makes it harder to find commits where lines changed.
    * Any non-fast-forward rebase can fall back to merge-and-resolve workflow.
9. Branches under `bugfix/*` or `feature/*` should never branch from a `release/*` branch.
    * Almost always should branch instead from `master`.
    * Sometimes may branch from another `bugfix/*` or `feature/*` branch.
10. Branches under `hotfix/*` should always branch from a `release/*` branch.
    * Merges should go back to the `release/*` _and_ `master`.
    * If/when EDD supports multiple versions, should merge into all supported releases.
11. Code must be well-formatted.
    * Python code must pass `flake8 --max-line-length=99`.
    * Python code should also pass `flake8 --max-complexity-10`.
    * TypeScript code should pass `tslint` (specific configuration is TBD).
    * Pure JavaScript code should pass `jslint` or `jshint` (specific configuration is TBD).
    * HTML in templates should generate code passing W3C HTML5 Validator.
