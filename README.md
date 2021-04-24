# action-pr-merged-announcer
GitHub action which creates an issue on a destination repo when a PR has been merged and the linked issue of the PR has a label that it is following.

## Inputs

### `who-to-greet`

**Required** The name of the person to greet. Default `"World"`.

## Outputs

### `time`

The time we greeted you.

## Example usage

uses: actions/hello-world-javascript-action@v1.1
with:
who-to-greet: 'Mona the Octocat'