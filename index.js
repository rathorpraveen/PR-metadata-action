const core = require('@actions/core');
const github = require('@actions/github');

const main = async () => {
  try {
    /**
     * We need to fetch all the inputs that were provided to our action
     * and store them in variables for us to use.
     **/
    const owner = core.getInput('owner', { required: true });
    const repo = core.getInput('repo', { required: true });
    const pr_number = core.getInput('pr_number', { required: true });
    const token = core.getInput('token', { required: true });
console.log("@@@@@@@@@@@@@@@@@@@ inside js "+owner);
  } catch (error) {
    core.setFailed(error.message);
  }
}

// Call the main function to run the action
main();
