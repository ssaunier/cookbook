/**
 * The source repository configuration every test runs against.
 *
 * `src/config.js` is the one file a fork is told to edit, so no test may read
 * it: a fork pointing the app at its own repository would otherwise turn a
 * green suite red without a single line of behaviour changing. `test/setup.js`
 * mocks the real module with this fixture for every spec.
 *
 * Two specs opt out on purpose. `test/config.spec.js` unmocks it and reads the
 * real file, because validating a fork's own edit is its whole job. The
 * "source repository configuration" block of `test/services/github.spec.js`
 * mocks in a third, deliberately different config, because proving that the
 * configured values reach the GitHub URLs at all is its whole job.
 */
export const recipesRepo = {
  owner: 'test-owner',
  repo: 'test-recipes',
  branch: 'main',
  directory: 'recipes'
}

export const repositoryUrl = `https://github.com/${recipesRepo.owner}/${recipesRepo.repo}`
