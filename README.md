<p>
  <img src="./asana-gitlab-logo.svg" width="320" alt="Asana-Gitlab Logo" />
</p>

# Asna-Gitlab

## Description

Asana and GitLab webhook endpoints to integrate the 2 systems.

It mainly performs 2 tasks

- assign Ids to tasks created by prepending \[&lt;Prefix&gt;-&lt;#&gt;] to the task name
- add Asana notes to tasks based on Gitlab commits/MRs (task Id mentioned in commit)

## Installation

```bash
$ npm init
```

This will copy `src/config/sample.env` to `.env`.
Then make sure to change the environment settings in `.env`.

You will need to have PA Tokens from both Asana and GitLab.
Also note your workspace and project gids from Asana.

You can manually set up webhooks in GitLab, just set up here the _secret_ too.
Set up the name of staging and production branches (direct pushes to these branches are ignored).

`STORAGE_WEBHOOK`: set up the JSON file name where Asana webhook info will be stored.

> If the file will be in a subfolder, make sure the subfolder exists.

`STORAGE_USERMAP`: path to a JSON file storing Asana/GitLab user information

```json
[
	{
		"email": "email@company.com",
		"name": "nick-name",
		"aId": "1111111111111111",
		"gId": 1234567,
		"aUtl": "1111111111111112"
	}
]
```

`"aId"` - Asana user gid

`"gId"` - GitLab user id (number)

`"aUtl"` - Asana user task list gid

For Asana side you can also set up the prefix used in id ( \[&lt;**Prefix**&gt;-&lt;#&gt;] ) and the name of the custom field that represents the task progress (or status).

## Set up Asana webhook

Asana webhooks need to be managed through the API.

For creation make sure `BASE_URL` was set up in `.env` and the app is running (see [Running the app](#running-the-app)).

```bash
# Create webhook
$ npm run asana:hook
```

> If setup is successful the created webhook's gid and the received secret token are saved in `STORAGE_WEBHOOK` file.

```bash
# Show webhook(s)
$ npm run asana:showHooks

# Delete webhook
$ npm run asana:delHook
```

> The delete will remove the webhook for which the gid was saved in `STORAGE_WEBHOOK` file.

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Functionality

### Asana webhook

For every task created in the project on which the webhook is set up, the app will change the title of the task and insert a task Id at the start. The task Id is in the form of **\[&lt;Prefix&gt;-&lt;#&gt;]**.

The number in this Id will increase with each new task created.

> This Id should be used in GitLab commit messages that relate to this task.

### GitLab webhook

The hook reacts to Push Notification and Merge Request Notifications.

> Note that pushes to staging and production branches are ignored. Use Merge Requests from feature branches.

The hook will extract Asana task Ids from commit messages and will retrieve the corresponding Asana tasks based on these Ids.

- **Push notification**

A new note will be added to the task containing information about the commits.

The progress of the task will be set to `In Progress`, unless not already that.

- **Merge Request notification**

Only open, close and merge actions are considered for MR.

> If MR is open in WIP mode, it is ignored

**Open**

A new note will be added to the task when MR is _open_, containing information about the MR and the assignee will be @-mentioned.

The progress of the task will be set to `Testing`, unless not already that.

**Closed**

A new note will be added to the task when MR is _closed_, containing information about the MR.

The progress of the task will be set to `In Progress`, unless not already that.

**Merged**

A new note will be added to the task when MR is _merged_, containing information about the MR and the merge commit.

The progress of the task will be set to `Deploying`, unless not already that.

## Acknowledgement

Inspired from _asana-github-tools_, [here's this project](https://github.com/johnkueh/asana-github-tools).

## Stay in touch

- Author - [Lorant Szakacs](lori.szy@gmail.com)

## License

Nest is [MIT licensed](LICENSE).
