# Contributing Guidelines

1. Never work without first properly setting up `git`. name and email.
    - Set your author/committer email: `git config --global user.email "user@example.org"`
    - Set your author/committer name: `git config --global user.name "First Last"`
    - Install pre-commit hooks: `pre-commit install`
2. Code for the EDD community.
    - EDD is designed to be a generic tool helpful to a large community of users.
    - Prefer configuration for institution-specific requirements.
    - We encourage seeking feedback, to focus effort on what is important to the community.
3. Code must be well-formatted.
    - Python code must be `black`. Enforced with the `pre-commit` plugin.
    - Python code should also pass `flake8 --max-complexity-10`. Also enforced with `pre-commit`.
    - TypeScript code should pass `tslint` with `tslint.yaml` config in `typescript` directory.
    - HTML in templates should generate code passing W3C HTML5 Validator.

# Making comments readable

1. Doc-strings should follow [PEP-257][2]; namely, use triple-quoted strings and written as
   compatible with indentation detection.
2. Multi-line comments and doc-strings should double-newline for paragraphs and wrap lines
   following `black` convention (80-characters wide, a bit over is fine). Wrapped lines
   that would leave an "orphan" word on a line by itself should insert newline wrap one
   word early.
3. Use end-of-line comments sparingly. If the comment is more than a few words, it belongs
   on the previous line.
4. List items that span multiple lines should have subsequent lines indented to make each
   item distinct.
5. When in doubt, use more white-space.

Do:

```python
def my_function(value_a, value_b, value_c=None):
    """
    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
    tempor incididunt ut labore et dolore magna aliqua. Dolor sed viverra
    ipsum nunc aliquet bibendum enim.

    In massa tempor nec feugiat. Nunc aliquet bibendum enim
    facilisis gravida.

    :param value_a: Fusce ut placerat orci nulla.
    :param value_b: Pharetra vel turpis nunc eget lorem dolor. Tristique
        senectus et netus et malesuada.
    :param value_c: Neque egestas congue quisque egestas.
    """
    # pass value_c thru the flux capacitor when value_b is over 88
    if value_b > 88:
        flux_capacitor(value_c)
```

Don't:

```python
def my_function(value_a, value_b, value_c=None):
    """
    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
    incididunt ut labore et dolore magna aliqua. Dolor sed viverra ipsum nunc aliquet
    enim.
    In massa tempor nec feugiat. Nunc aliquet bibendum enim facilisis gravida.
    :param value_a: Fusce ut placerat orci nulla.
    :param value_b: Pharetra vel turpis nunc eget lorem dolor. Tristique
    senectus et netus et malesuada.
    :param value_c: Neque egestas congue quisque egestas.
    """
    if value_b > 88:  # pass value_c thru the flux capacitor when value_b is over 88
        flux_capacitor(value_c)
```

# Guidelines for JBEI and ABF Developers

These guidelines apply specifically to developers at JBEI, ABF, or ESE; whom at
least in theory could directly commit to the repo at
[https://github.com/JBEI/edd/][1] via GitHub or the local mirror in Bitbucket.

1. All work shall occur in branches created from a JIRA ticket or GitHub Issue.
   Submit a ticket or discuss new work with core contributors to get feedback
   on planned work. Major changes should be discussed with core
   contributors first.
2. Changes to `trunk` and `release/*` branches must come through a
   pull request.
3. Changes to all other branches are encouraged to go through a pull request.
4. Prefer deleting source branch on merging a pull request, to keep the branch
   list manageable.
5. Prefer rebasing to keep branches up-to-date with changes to parent branch.
   Merges will make the developer performing the merge the author of incoming
   changes. Change in authorship makes it harder to find commits where lines
   changed. Any non-fast-forward rebase can fall back to
   merge-and-resolve workflow.
6. Branches under `bugfix/*` or `feature/*` should never branch from a
   `release/*` branch. Almost always should branch instead from `trunk`.
   Sometimes may branch from another `bugfix/*` or `feature/*` branch.
7. Branches under `hotfix/*` should always branch from a `release/*` branch.
   Merges should go back to the `release/*` _and_ `trunk`. If/when EDD
   supports multiple versions, should merge into all supported releases.

[1]: https://github.com/JBEI/edd/
[2]: https://www.python.org/dev/peps/pep-0257/
