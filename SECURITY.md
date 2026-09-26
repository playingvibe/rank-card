# Security policy

## Reporting a vulnerability

**Please don't open a public issue or pull request for a security problem.**

Use GitHub's private reporting instead: on this repository, open the **Security** tab and choose
**Report a vulnerability**. It reaches the maintainers only. If that isn't available to you, message
a maintainer in the [support server](https://discord.gg/nMJJ8PAcD9) and ask for a private channel,
without describing the problem in public.

Please include what you found, where (a file and a line), how to reproduce it, and what you think an
attacker could do with it. Never include, or test with, other people's data or accounts.

You'll get an answer within a few days. We'll tell you when it's fixed and, if you want, credit you.

## What's in scope

- The code in this repository. The card renders text and fetches an avatar image from a URL it is given,
  so the interesting areas are: what a hostile username or avatar URL can do (a slow or huge response, an
  unexpected redirect, a malformed image), and what a hostile number can do (a value that hangs or crashes
  the renderer).

## What isn't

- The bot's own code and hosting, which aren't in this repository. If you found something there, the
  private route above still reaches us.
- Discord, Node.js, `@napi-rs/canvas` or any other dependency: report those to their owners.
- Findings that need control of the machine that runs the renderer, and denial-of-service by volume.

## What this repository holds

No secrets. If you find one in this repository or its history, that is a vulnerability: report it as above.
