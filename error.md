# Errors and Failed Attempts - Slong XYZ

## 2026-04-27
- **WSL Git Push Hang**: Attempting to push to GitHub via WSL `git push` hung indefinitely. Resolved by using MCP `push_files` tool to sync the local state to the empty GitHub repository.
- **Domain Migration**: Verified all branding references to .io were updated to .xyz.
- **Vercel Sync**: Instead of re-linking Vercel to a new repo, we updated the existing `slong-io` repository which is already linked to the Vercel deployment. This ensures an immediate update to the live site.
