# Security policy

## Supported versions

opx is in beta. Security fixes are released for the latest published version of each `@allons-y/opx*` package.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem.

Report it privately by either:

- using GitHub's [private vulnerability reporting](https://github.com/allonsy-studio/opx/security/advisories/new) for this repository, or
- emailing <consulting@allons-y.studio> with the subject "opx security".

Please include:

- the affected package and version (`opx --version`),
- a description of the issue and its impact,
- steps to reproduce, or a proof of concept.

You can expect an acknowledgement within a few business days. We'll keep you informed while we investigate, and credit you in the release notes if you'd like.

## Scope

opx runs in developers' repositories and in CI, and it executes code from the plugins installed in a project. Reports of particular interest include:

- a plugin being loaded or run that the project did not install and enable,
- command execution or file writes outside the project directory,
- unsafe handling of repository content, such as paths, config files, or git output,
- secrets (such as `NPM_TOKEN` or `GITHUB_TOKEN`) being exposed by the release flow.

Running opx in a repository you don't trust executes that repository's configuration and plugins, exactly as running ESLint or a build does. That is expected behavior rather than a vulnerability. Reports about opx running code that the repository did *not* configure or install are in scope.

Vulnerabilities in third-party plugins should be reported to those plugins' maintainers.
