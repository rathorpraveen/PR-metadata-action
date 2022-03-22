const core = require('@actions/core');
const github = require('@actions/github');
const urlencode = require("urlencode");
const path = require("path");
const url = require("url");
const axios = require("axios");
var accessToken;
var teamSpaceId;
var projectId;
var repoId;
var assetId;
var externalType;
var dektopProjId;
var exeId;
var resultId;
var exeStatus;
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
    const serverUrl = core.getInput('serverUrl',{required: true});
    const offlineToken = core.getInput('offlineToken',{required: true});
    const teamspace = core.getInput('teamspace',{required: true});
    const project  = core.getInput('project',{required: true});
    const branch  = core.getInput('branch',{required: true});
    const repository  = core.getInput('repository',{required: true});
    const filepath  = core.getInput('filepath',{required: true});

    console.log("@@@@@@@@@@@@@@@@@@@ teamspace "+teamspace);
    console.log("@@@@@@@@@@@@@@@@@@@ project "+project);
    console.log("@@@@@@@@@@@@@@@@@@@ branch "+branch);
    console.log("@@@@@@@@@@@@@@@@@@@ repository "+repository);
    console.log("@@@@@@@@@@@@@@@@@@@ filepath "+filepath);
    
    
    await serverSSLCheck(serverUrl);

    await teamspaceIdGenByName(serverUrl, teamspace, offlineToken);

    await projectIdGenByName(serverUrl,project,teamspace,offlineToken);

    await repoIdGenByName(serverUrl,project,repository,offlineToken);

    await branchValidation(serverUrl,branch,project,offlineToken);

    await AssetIdGenByName(serverUrl,filepath,branch,repository,project,offlineToken);

    await startJobExecution(serverUrl,branch,offlineToken);

    if (
      exeStatus != 'COMPLETE' ||
      exeStatus != 'COMPLETE_WITH_ERROR' ||
      exeStatus != 'STOPPED_BY_USER' ||
      exeStatus != 'STOPPED_AUTOMATICALLY' ||
      exeStatus != 'INCOMPLETE' ||
      exeStatus != 'CANCELED' ||
      exeStatus != 'LAUNCH_FAILED'
    )
    {

      await pollJobStatus(serverUrl, offlineToken);
    }

     await getResults(serverUrl, offlineToken);
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function getResults(serverUrl, offlineToken) {
  var resultsURL =
  serverUrl +
    "rest/projects/" +
    projectId +
    "/results/" +
    resultId;

  await accessTokenGen(serverUrl, offlineToken);

  var headers = {
    "Accept-Language": "en",
    Authorization: "Bearer " + accessToken,
  };
  return axios
    .get(resultsURL, { headers: headers })
    .then((response) => {
      if (response.status != 200) {
        throw new Error(
          "Error during retrieval of results. " +
            resultsURL +
            " returned " +
            response.status +
            " response code. Response: " +
            response.data
        );
      }
      var parsedJSON = response.data;
      var verdict = parsedJSON.verdict;
      console.log("");
      console.log("Test Result = " + verdict);
      if (verdict == "ERROR" || verdict == "FAIL") {
        
        var message = parsedJSON.message;
        console.log("");
        console.log("Error Message = " + message);
      } else {
        console.log("failed");
      }
      console.log("");
      if (
        exeStatus != 'CANCELED' &&
        exeStatus != 'LAUNCH_FAILED'
      ) {
        var total = parsedJSON.reports.length;

        if (total > 0) {
          console.log("Reports information:");
          for (var i = 0; i < total; i++) {
            let reportName = parsedJSON.reports[i].name;
            let reporthref = parsedJSON.reports[i].href;
            console.log(
              reportName +
                " : " +
                url.resolve(serverUrl, reporthref)
            );
          }
        } else {
          console.log("Reports unavailable.");
        }
      }
      return true;
    })
    .catch((error) => {
      throw new Error(
        "Error when accessing results URL - " + resultsURL + ". Error: " + error
      );
    });
}


async function getJobStatus(serverUrl, offlineToken) {
  console.log("############################# inside get job status");
  var jobStatusURL =
  serverUrl +
    "rest/projects/" +
    projectId +
    "/executions/" +
    exeId;

  await accessTokenGen(serverUrl,offlineToken);

  var headers = {
    "Accept-Language": "en",
    Authorization: "Bearer " + accessToken,
  };
  var status;
  return axios
    .get(jobStatusURL, { headers: headers })
    .then((response) => {
      if (response.status != 200) {
        throw new Error(
          "Error during retrieval of test execution status. " +
            jobStatusURL +
            " returned " +
            response.status +
            " response code. Response: " +
            response.data
        );
      }
      var parsedJSON = response.data;
      status = parsedJSON.status;
      console.log("############################# inside get job status status is "+status);
      if (exeStatus != status) {
        exeStatus = status;
        console.log(
          getDateTime() + " Test Execution Status: " + exeStatus
        );
      }
    })
    .catch((error) => {
      throw new Error(
        "Error when accessing test execution status URL - " +
          jobStatusURL +
          ". Error: " +
          error
      );
    });
}

async function pollJobStatus(serverUrl, offlineToken) {
  return new Promise((resolve, reject) => {
    var timerId = setInterval(async function () {
      try {
        await getJobStatus(serverUrl, offlineToken);
	      console.log("KKKKKKKKKKKKKKexeStatusKKKKKKKKKKKKKKKKK = "+exeStatus);
        if (
          exeStatus == 'COMPLETE' ||
          exeStatus == 'COMPLETE_WITH_ERROR' ||
          exeStatus == 'STOPPED_BY_USER' ||
          exeStatus == 'STOPPED_AUTOMATICALLY' ||
          exeStatus == 'INCOMPLETE' ||
          exeStatus == 'CANCELED' ||
          exeStatus == 'LAUNCH_FAILED'
        ){
          // stop polling on end state
          clearInterval(timerId);
          resolve(true);
        }
        // continue polling...
      } catch (error) {
        // stop polling on any error
        clearInterval(timerId);
        reject(error);
      }
    }, 11000);
  });
}


async function startJobExecution(serverUrl,branch,offlineToken) {
  let jobExecURL =
    serverUrl +
    "rest/projects/" +
    projectId +
    "/executions/";
  var AssetParameters = {
    testAsset: {
      assetId: assetId,
      revision: branch,
    },
    offlineToken: offlineToken,
  };
 
  await accessTokenGen(serverUrl, offlineToken);

  var headers = {
    "Accept-Language": "en",
    "Content-Type": "application/json",
    Authorization: "Bearer " + accessToken,
  };
  var body = JSON.stringify(AssetParameters);
  console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& request body = "+body);
  return axios
    .post(jobExecURL, body, { headers: headers })
    .then((response) => {
      if (response.status != 201) {
        throw new Error(
          "Error during launch of test. " +
            jobExecURL +
            " returned " +
            response.status +
            " response code. Response: " +
            response.data
        );
      }
      var parsedJSON = response.data;
      exeId = parsedJSON.id;
      resultId = parsedJSON.result.id;
      exeStatus = parsedJSON.status;
      console.log("@@@@@@@@@@@@@parsedJSON.id@@@@@@@@@@@@@@@@ "+parsedJSON.id);
      console.log("@@@@@@@@@@@@@@@@@@@@"+parsedJSON.result.id);
      console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@ status is ="+parsedJSON.status);
      return true;
    })
    .catch((error) => {
      throw new Error(
        "Error when accessing test execution URL - " +
          jobExecURL +
          ". Error: " +
          error
      );
    });
}

async function AssetIdGenByName(serverUrl,filepath,branch,repositories,project,offlineToken) {
  var assetName =  path.parse(filepath).name;
  var encodedAssetName = urlencode(assetName);
  var encodedBranchName = urlencode(branch);
  var testsListURL =
    serverUrl +
    "rest/projects/" +
    projectId +
    "/assets/?assetTypes=EXECUTABLE&name=" +
    encodedAssetName +
    "&revision=" +
    encodedBranchName +
    "&deployable=true";

  await accessTokenGen(serverUrl,offlineToken);

  var headers = {
    "Accept-Language": "en",
    Authorization: "Bearer " + accessToken,
  };
  return axios
    .get(testsListURL, { headers: headers })
    .then((response) => {
      if (response.status != 200) {
        throw new Error(
          "Error during retrieval of testassets. " +
            testsListURL +
            " returned " +
            response.status +
            " response code. Response: " +
            response.data
        );
      }
      var parsedJSON = response.data;
      var total = parsedJSON.totalElements;
      var retrievedPath;
      var retrievedRepoId;
      var gotId = false;
      if (total > 0) {
        for (var i = 0; i < total; i++) {
          retrievedPath = parsedJSON.content[i].path;
          retrievedRepoId = parsedJSON.content[i].repository_id;
          if (
            retrievedPath == filepath &&
            retrievedRepoId == repoId
          ) {
            assetId = parsedJSON.content[i].id;
            externalType = parsedJSON.content[i].external_type;
            dektopProjId = parsedJSON.content[i].desktop_project_id;
            gotId = true;
            return true;
          }
        }
        if (!gotId) {
          throw new Error(
            "The file path " +
              filepath +
              " was not found in the branch " +
              branch +
              " corresponding to the repository " +
              repository +
              " in the project " +
              project +
              ". Please check the File path field in the task."
          );
        }
      } else {
        throw new Error(
          "The file path " +
          filepath +
          " was not found in the branch " +
          branch +
          " corresponding to the repository " +
          repository +
          " in the project " +
          project +
          ". Please check the File path field in the task."
        );
      }
    })
    .catch((error) => {
      throw new Error(
        "Error when accessing testassets API - " +
          testsListURL +
          ". Error: " +
          error
      );
    });
}



async function branchValidation(serverUrl,branch,project,offlineToken) {
  let branchListURL =
   serverUrl +
    "rest/projects/" +
    projectId +
    "/branches/";

  await accessTokenGen(serverUrl, offlineToken);

  var headers = {
    "Accept-Language": "en",
    Authorization: "Bearer " + accessToken,
  };
  return axios
    .get(branchListURL, { headers: headers })
    .then((response) => {
      if (response.status != 200) {
        throw new Error(
          "Error during retrieval of branches. " +
            branchListURL +
            " returned " +
            response.status +
            " response code. Response: " +
            response.data
        );
      }
      var parsedJSON = response.data;
      var total = parsedJSON.totalElements;
      var RetrievedBranchName;
      var gotBranch = false;
      if (total > 0) {
        for (var i = 0; i < total; i++) {
          RetrievedBranchName = parsedJSON.content[i].name;
          if (branch == RetrievedBranchName) {
            gotBranch = true;
            return true;
          }
        }
        if (gotBranch == false) {
          throw new Error(
            "The branch " +
              branch +
              " was not found in the project " +
              project +
              ". Please check the Branch field in the task."
          );
        }
      } else {
        throw new Error(
          "The branch " +
            branch +
            " was not found in the project " +
            project +
            ". Please check the Branch field in the task."
        );
      }
    })
    .catch((error) => {
      throw new Error(
        "Error when accessing branch list API - " +
          branchListURL +
          ". Error: " +
          error
      );
    });
}




async function repoIdGenByName(serverUrl,project,repository,offlineToken) {
  let reposListURL =
    serverUrl +
    "rest/projects/" +
    projectId +
    "/repositories/";

  await accessTokenGen(serverUrl,offlineToken);

  var headers = {
    "Accept-Language": "en",
    Authorization: "Bearer " + accessToken,
  };
  return axios
    .get(reposListURL, { headers: headers })
    .then((response) => {
      if (response.status != 200) {
        throw new Error(
          "Error during retrieval of repositories. " +
            reposListURL +
            " returned " +
            response.status +
            " response code. Response: " +
            response.data
        );
      }
      var parsedJSON = response.data;
      var total = parsedJSON.totalElements;
      let retrievedRepoName;
      let gotId = false;
      if (total > 0) {
        for (var i = 0; i < total; i++) {
          retrievedRepoName = parsedJSON.content[i].uri;
          if (repository == retrievedRepoName) {
            repoId = parsedJSON.content[i].id;
            gotId = true;
            return true;
          }
        }
        if (!gotId) {
          throw new Error(
            "The repository " +
              repository +
              " was not found in the project " +
              project +
              " Please check the Repository field in the task."
          );
        }
      } else {
        throw new Error(
          "The repository " +
            repository +
            " was not found in the project " +
            project +
            " Please check the Repository field in the task."
        );
      }
    })
    .catch((error) => {
      throw new Error(
        "Error when accessing repository list API - " +
          reposListURL +
          ". Error: " +
          error
      );
    });
}

async function projectIdGenByName(serverUrl,project,teamspace,offlineToken) {
  let encodedProjName = urlencode(project);
  let projectsListURL =
    serverUrl +
    "rest/projects?archived=false&member=true&name=" +
    encodedProjName;

  await accessTokenGen(serverUrl,offlineToken);

  var headers = {
    "Accept-Language": "en",
    Authorization: "Bearer " + accessToken,
    spaceId: teamSpaceId,
  };
  return axios
    .get(projectsListURL, { headers: headers })
    .then((response) => {
      if (response.status != 200) {
        throw new Error(
          "Error during retrieval of projects. " +
            projectsListURL +
            " returned " +
            response.status +
            " response code. Response: " +
            response.data
        );
      }
      var parsedJSON = response.data;
      var total = parsedJSON.total;
      var retrievedProjName;
      var gotId = false;
      if (total > 0) {
        for (var i = 0; i < total; i++) {
          retrievedProjName = parsedJSON.data[i].name;
          if (project == retrievedProjName) {
            projectId = parsedJSON.data[i].id;
            gotId = true;
            return true;
          }
        }
        if (!gotId) {
          throw new Error(
            "You do not have access to the project " +
              project +
              " or the project was not found in the teamspace " +
              teamspace +
              " in the server. Please check the Project field in the task."
          );
        }
      } else {
        throw new Error(
          "You do not have access to the project " +
            project +
            " or the project was not found in the teamspace " +
            teamspace +
            " in the server. Please check the Project field in the task."
        );
      }
    })
    .catch((error) => {
      throw new Error(
        "Error when accessing projects list API - " +
          projectsListURL +
          ". Error: " +
          error
      );
    });
}
function serverSSLCheck(serverUrl) {
  var sslCheckUrl = serverUrl;
  return axios
    .get(sslCheckUrl)
    .then((response) => {
      return true;
    })
    .catch((error) => {
      if (error.code == "ENOTFOUND") {
        throw new Error(
          "Cannot resolve the host. Please check the server URL and connectivity to the server."
        );
      } else if (error.code == "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
        throw new Error(
          "Could not establish secure connection to the server " +
          serverUrl +
            ". Please validate the SSL certificate of the server or import the CA certificate of the server to your trust store. Error: " +
            error.message
        );
      } else if (error.code == "CERT_HAS_EXPIRED") {
        throw new Error(
          "Could not establish secure connection to the server " +
          serverUrl +
            ". The server presented an expired SSL certificate. Error: " +
            error.message
        );
      } else {
        throw new Error(
          "Could not establish secure connection to the server " +
          serverUrl +
            ". Error: " +
            error.message
        );
      }
    });
}

function accessTokenGen(serverUrl,offlineToken) {
  var tokenURL = serverUrl + "rest/tokens/";
  var body = "refresh_token=" + offlineToken;
  var headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  return axios
    .post(tokenURL, body, {
      headers: headers,
    })
    .then((response) => {
      if (
        response.status == 400 ||
        response.status == 401 ||
        response.status == 402
      ) {
        throw new Error(
          "Error during retrieval of access token. Please check the offline token in the service connection. Request returned response code: " +
            response.status
        );
      }
      if (response.status == 403) {
        throw new Error(
          "Error during retrieval of access token. Please check the license as request is unauthorized. Request returned response code: " +
            response.status
        );
      }
      if (response.status != 200) {
        throw new Error(
          "Error during retrieval of access token. Request returned response code: " +
            response.status
        );
      }
      accessToken = response.data.access_token;
      return response.data;
    })
    .catch((error) => {
      if (error.code == "ENOTFOUND") {
        throw new Error(
          "Cannot resolve the host. Please check the server URL and connectivity to the server."
        );
      } else if (error.code == "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
        throw new Error(
          "Could not establish secure connection to the server " +
            serverUrl +
            ". Please validate the SSL certificate of the server or import the CA certificate of the server to your trust store. Error: " +
            error.message
        );
      } else if (error.code == "CERT_HAS_EXPIRED") {
        throw new Error(
          "Could not establish secure connection to the server " +
          serverUrl +
          +
            ". The server presented an expired SSL certificate. Error: " +
            error.message
        );
      } else {
        throw new Error(
          "Error when accessing Token management URL: " +
            tokenURL +
            " Error: " +
            error
        );
      }
    });
}

async function teamspaceIdGenByName(serverUrl,teamspace,offlineToken) {
  let encodedTeamspaceName = urlencode(teamspace);
  let teamspacesListURL =
     serverUrl +
    "rest/spaces?search=" +
    encodedTeamspaceName +
    "&member=true";

  await accessTokenGen(serverUrl,offlineToken,teamspace);
  console.log("##########################access token is = "+accessToken);
  var headers = {
    "Accept-Language": "en",
    Authorization: "Bearer " + accessToken,
  };
  return axios
    .get(teamspacesListURL, { headers: headers })
    .then((response) => {
      if (response.status != 200) {
        throw new Error(
          "Error during retrieval of teamspaces. " +
            teamspacesListURL +
            " returned " +
            response.status +
            " response code. Response: " +
            response.data
        );
      }
      var parsedJSON = response.data;
      var retrievedTeamSpaceName;
      var gotId = false;
      var total = parsedJSON.length;
      if (total > 0) {
        for (var i = 0; i < total; i++) {
          retrievedTeamSpaceName = parsedJSON[i].displayName;
          if (teamspace == retrievedTeamSpaceName) {
            teamSpaceId = parsedJSON[i].id;
            gotId = true;
            return;
          }
        }
        if (!gotId) {
          throw new Error(
            "You do not have access to the team space " +
              teamspace +
              " or the team space was not found in the server. Please check the Team Space field in the task."
          );
        }
      } else {
        throw new Error(
          "You do not have access to the team space " +
          teamspace +
          +
            " or the team space was not found in the server. Please check the Team Space field in the task."
        );
      }
    })
    .catch((error) => {
      throw new Error(
        "Error when accessing teamspaces list API - " +
          teamspacesListURL +
          ". Error: " +
          error
      );
    });
} 


// Call the main function to run the action
main();
