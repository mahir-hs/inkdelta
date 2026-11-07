// The start screen. An empty screen is an invitation: say what to do, and make it one click.

import { CloudDownload, FolderOpen, GitCompareArrows } from "lucide-react";
import { relativeTime } from "../../lib/format";
import { getRecent } from "../../store/recent";
import { useWorkspace } from "../../store/workspace";

export function Welcome() {
  const { openFolder, compareTwoFiles, cloneRepository, openPath } = useWorkspace.getState();
  const recent = getRecent();

  const actions = [
    { Icon: FolderOpen, label: "Open a project folder", hint: "Browse every saved version of your paper", run: openFolder, primary: true },
    { Icon: CloudDownload, label: "Clone a repository", hint: "Download a project from GitHub or GitLab", run: cloneRepository },
    { Icon: GitCompareArrows, label: "Compare two files", hint: "Pick any two .docx files, no Git needed", run: compareTwoFiles },
  ];

  return (
    <section className="welcome">
      <img className="welcome-mark" src="/logo.svg" alt="" width={56} height={56} />
      <h1>See what changed.</h1>
      <p className="welcome-lede">Redline any two versions of a Word document, work through reviewer comments, and manage the project with Git.</p>

      <ul className="welcome-actions">
        {actions.map(({ Icon, label, hint, run, primary }) => (
          <li key={label}>
            <button className={primary ? "welcome-action primary-action" : "welcome-action"} onClick={() => void run()}>
              <span className="welcome-icon"><Icon size={18} /></span>
              <span className="welcome-text">
                <span className="welcome-label">{label}</span>
                <span className="welcome-hint">{hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {recent.length > 0 && (
        <div className="recent">
          <h2>Recent</h2>
          <ul>
            {recent.map((project) => (
              <li key={project.path}>
                <button onClick={() => void openPath(project.path)} title={project.path}>
                  <span className="recent-name">{project.name}</span>
                  <span className="recent-path">{project.path}</span>
                  <span className="recent-time">{relativeTime(project.openedAt / 1000)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="welcome-tip">Press <kbd>Ctrl</kbd> <kbd>K</kbd> for every command.</p>
    </section>
  );
}
