const core = require('@actions/core');
const github = require('@actions/github');
const {Toolkit} = require('actions-toolkit');
const issueParser = require('issue-parser')
const parse = issueParser('github');
//const TESTING_REPO = 'neve'
const TESTING_REPO = '';
Toolkit.run(async tools => {
    try {
        if (!tools.context.payload.pull_request) {
            tools.log.warn('Not a pull request skipping verification!');
            return;
        }
        if (tools.context.payload.pull_request.state !== 'closed') {
            tools.log.warn('Not a closed PR event. skipping verification!');
            return;
        }
        if (!tools.context.payload.pull_request.merged) {
            tools.log.warn('Not a merged PR event. skipping verification!');
            return;
        }

        const labelToCheck = core.getInput('subscribe_label');
        const destinationRepo = core.getInput('destination_repo');
        const issueTemplateContent = core.getInput('issue_template_content');
        const issueTemplateTitle = core.getInput('issue_template_title');
        const issueLabels = core.getInput('issue_labels');


        tools.log.debug('Starting Linked Issue verification!');
        let linkedIssues = await getLinkedIssue(tools);
        tools.log.debug("Linked Issues: ");
        tools.log.debug(linkedIssues);
        if (linkedIssues.length === 0) {
            tools.exit.success("No linked issues found")
        }
        tools.log.debug("Checking issues for labels:  " + labelToCheck);
        linkedIssues = await getSubscribedIssues(tools, linkedIssues, labelToCheck);
        tools.log.debug("Found " + linkedIssues.length + ' issues with label ' + labelToCheck);
        if (linkedIssues.length === 0) {
            tools.exit.success("No issues with subscribed label found")
        }
        await createNewIssues(tools, linkedIssues, {
            destinationRepo,
            issueTemplateContent,
            issueTemplateTitle,
            issueLabels
        });

    } catch (err) {
        tools.log.error(`Error verifying issues.`)
        tools.log.error(err)

        if (err.errors) tools.log.error(err.errors)
        const errorMessage = "Error verifying issues."
        core.setFailed(errorMessage + '\n\n' + err.message)
        tools.exit.failure()
    }
}, {
    secrets: ['GITHUB_TOKEN']
});

async function createNewIssues(tools, linkedIssues, {
    destinationRepo,
    issueTemplateContent,
    issueTemplateTitle,
    issueLabels
}) {
    const github = tools.github,
        log = tools.log;
    let destination = destinationRepo.split('/');
    destination = {owner: destination[0], repo: destination[1]};
    for (let i = 0, len = linkedIssues.length; i < len; i++) {
        let linkedIssue = linkedIssues[i];
        log.debug("Verifying issue", linkedIssue);
        let linkedIssueDetails = await github.issues.get(linkedIssue);

        let hasLinkedIssueMention = false;
        try {
            let linkedIssueEvents = await github.issues.listEventsForTimeline(linkedIssue);
            linkedIssueEvents = linkedIssueEvents.data.filter(data => {
                return data.event === 'cross-referenced'
            });
            linkedIssueEvents.forEach(linkedEventData => {
                const linkedRepo = linkedEventData.source.issue.repository.full_name || '';
                if (linkedRepo === destinationRepo) {
                    hasLinkedIssueMention = true;
                }
            })
        } catch (err) {
            hasLinkedIssueMention = false;
        }
        if (hasLinkedIssueMention) {
            log.debug("Linked issue has already a connected one.", linkedIssue);
            continue;
        }
        await github.issues.create({
            owner: destination.owner,
            repo: destination.repo,
            labels: issueLabels.length > 0 ? issueLabels.split(',') : [],
            body: issueTemplateContent.replace(/{issue_link}/g, linkedIssueDetails.data.html_url),
            title: issueTemplateTitle.replace('{issue_title}', linkedIssueDetails.data.title.substring(0, 150))
        });
        log.debug("Created connected issue ", linkedIssue);
    }


}

async function getSubscribedIssues(tools, linkedIssues, subscribeLabel) {
    const github = tools.github;
    let subscribedIssues = [];
    let issueLabels;
    let hasLabel = false;
    for (let i = 0, len = linkedIssues.length; i < len; i++) {
        issueLabels = await github.issues.listLabelsOnIssue(linkedIssues[i]);
        issueLabels.data.forEach(label => {
            if (label.name === subscribeLabel) {
                hasLabel = true;
            }
        });
        if (hasLabel) {
            subscribedIssues.push(linkedIssues[i]);
        }
    }
    return subscribedIssues
}

async function getLinkedIssue(tools) {
    const context = tools.context,
        github = tools.github,
        log = tools.log;

    let bodyLinkedIssues = await checkBodyForValidIssue(context, github, log);
    let eventsLinkedIssues = await checkEventsListForConnectedEvent(context, github, log);

    log.debug("Found " + bodyLinkedIssues.length + " PR body issues and " + eventsLinkedIssues.length + " events linked issues.");
    let allIssues = bodyLinkedIssues.concat(eventsLinkedIssues);
    const seen = new Set();
    allIssues = allIssues.filter(el => {
        let elementKey = JSON.stringify(el);
        const duplicate = seen.has(elementKey);
        seen.add(elementKey);
        return !duplicate;
    });
    return allIssues;
}


async function checkBodyForValidIssue(context, github, log) {
    let body = context.payload.pull_request.body;
    log.debug(`Checking PR Body: "${body}"`)
    const matches = parse(body);
    log.debug(`regex matches:  `)
    log.debug(matches.allRefs)
    let issues = [];
    if (matches.allRefs) {
        for (let i = 0, len = matches.allRefs.length; i < len; i++) {
            let match = matches.allRefs[i];
            let issueId = match.issue;
            let owner = context.repo.owner;
            let repo = TESTING_REPO.length > 0 ? TESTING_REPO : context.repo.repo;
            if (match.slug) {
                let slugParts = match.slug.split('/');
                owner = slugParts[0];
                repo = slugParts[1];
            }
            log.debug(`Checking if is valid issue issueId: ${issueId}`)
            try {

                let issue = await github.issues.get({
                    owner: owner,
                    repo: repo,
                    issue_number: issueId,
                });
                if (issue) {
                    log.debug(`Found issue in PR Body ${match.raw}`);
                    issues.push({
                        owner: owner,
                        repo: repo,
                        issue_number: issueId,
                    });
                }
            } catch {
                log.debug(`#${issueId} is not a valid issue.`);
            }
        }
    }
    return issues;
}

async function checkEventsListForConnectedEvent(context, github, log) {
    let pull;
    try {
        pull = await github.issues.listEvents({
            owner: context.repo.owner,
            repo: TESTING_REPO.length > 0 ? TESTING_REPO : context.repo.repo,
            issue_number: context.payload.pull_request.number
        });
    } catch (e) {
        return [];
    }
    let issues = [];
    if (pull.data) {
        log.debug(`Checking events: ${pull.data}`)
        let eventData;
        let item;
        for (let i = 0, len = pull.data.length; i < len; i++) {
            item = pull.data[i];
            if (item.event === "connected") {
                log.debug(`Found connected event.`);
                eventData = await github.issues.getEvent({
                    owner: context.repo.owner,
                    repo: TESTING_REPO.length > 0 ? TESTING_REPO : context.repo.repo,
                    event_id: item.id
                });
                issues.push({
                    owner: context.repo.owner,
                    repo: TESTING_REPO.length > 0 ? TESTING_REPO : context.repo.repo,
                    issue_number: eventData.data.issue.number
                });
            }
            if (item.event === "disconnected") {
                log.debug(`Found disconnect event.`);
                eventData = await github.issues.getEvent({
                    owner: context.repo.owner,
                    repo: TESTING_REPO.length > 0 ? TESTING_REPO : context.repo.repo,
                    event_id: item.id
                });
                issues = issues.filter(issueData => issueData.issue_number !== eventData.data.issue.number);
            }
        }
    }
    return issues;
}