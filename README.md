To push code to a GitHub repository, you need to use Git commands. Here's a step-by-step guide:

1. **Initialize Git Repository (if not already done)**:
   If you haven't initialized a Git repository in your project folder, you need to do this first. Open a terminal/command prompt and navigate to your project folder, then run:

   ```bash
   git init
   ```

2. **Add Files to Staging Area**:
   Stage the files you want to commit by using the `git add` command. You can add specific files or use `.` to add all files in the current directory.

   ```bash
   git add .
   ```

3. **Commit Changes**:
   Commit the staged changes with a descriptive message using the `git commit` command:

   ```bash
   git commit -m "Your commit message here"
   ```

4. **Link to GitHub Repository**:
   If you haven't linked your local repository to the GitHub repository, you need to add the remote URL. Replace `<username>` with your GitHub username and `<repository>` with your repository name.

   ```bash
   git remote add origin https://github.com/<username>/<repository>.git
   ```

5. **Push Changes to GitHub**:
   Finally, push your committed changes to GitHub using the `git push` command. Replace `<branch>` with the branch you want to push to (usually `main` or `master`):

   ```bash
   git push origin <branch>
   ```

6. **Enter Credentials**:
   If prompted, enter your GitHub username and password/token for authentication. To avoid entering credentials each time, consider using an SSH key or a personal access token.

Here's the entire sequence of commands:

```bash
# Run these commands once if the repository is not already initialized
git init

# Stage your changes
git add .

# Commit with a message
git commit -m "Your commit message here"

# Link to your GitHub repository
git remote add origin https://github.com/<username>/<repository>.git

# Push changes to GitHub
git push origin <branch>
```

For more advanced scenarios or if you're using different authentication methods (SSH keys, access tokens), the commands might vary slightly. Make sure to adapt the commands to your specific use case.


*****************************************************************************************************************************************************************************************************

Sure, here's how you can create a new branch and push code to GitHub using Git commands:

1. **Create a New Branch**:
   To create a new branch and switch to it, use the following command. Replace `<new-branch-name>` with the name you want to give your new branch:

   ```bash
   git checkout -b <new-branch-name>
   ```

2. **Make Changes and Commit**:
   Make your changes to the code, stage them, and commit as usual:

   ```bash
   git add .
   git commit -m "Your commit message here"
   ```

3. **Push New Branch to GitHub**:
   When you're ready to push the new branch to GitHub, use the following command. Replace `<new-branch-name>` with the name of your new branch:

   ```bash
   git push origin <new-branch-name>
   ```

   If the branch doesn't exist on the remote (GitHub) repository, this command will create the branch and push your changes to it.

So, here's the complete sequence of commands:

```bash
# Create a new branch and switch to it
git checkout -b <new-branch-name>

# Make changes, stage, and commit
git add .
git commit -m "Your commit message here"

# Push the new branch to GitHub
git push origin <new-branch-name>
```

This will create a new branch, add your changes, commit them, and then push the new branch along with the changes to your GitHub repository.
