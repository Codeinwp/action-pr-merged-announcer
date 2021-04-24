# action-pr-merged-announcer
GitHub action which creates an issue on a destination repo when a PR has been merged and the linked issue of the PR has a label that it is following.

## Inputs

### `subscribe_label`

**Required** The name of the issue label which we should watch. Default `"doc-needed"`.

### `destination_repo`

**Required** The name of the repo where we will create the issue as `<owner>/<repo>`. Default ``.

### `issue_labels`

**Optional** Labels of the new issue. Default ``.

### `issue_template_content`

**Optional** Content of the new issue. Default `There is a new documentation request for {issue_link}. More details about it [here]({issue_link})`.

### `issue_template_title`

**Optional** Title of the new issue. Default `Documentation for {issue_title}`.


## Example usage
```yaml
on:
  pull_request:
    types: [closed]
    branches:
      - development

jobs:
  pr_announcer:
    runs-on: ubuntu-latest
    name: Sample job
    steps:
      - name: Checkout
        uses: actions/checkout@v2
      - name: Checking merged commit
        uses: Codeinwp/action-pr-merged-announcer@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          destination_repo: "Codeinwp/docs"
          issue_labels: "neve"
```