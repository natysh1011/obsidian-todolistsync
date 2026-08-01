<template>
  <section class="dashboard-preview" aria-label="Synthetic dashboard preview">
    <header class="preview-header">
      <div>
        <span class="preview-eyebrow">TASK NOTES</span>
        <h2>Dashboard</h2>
      </div>
      <div class="preview-actions" aria-label="Example dashboard actions">
        <span class="preview-button preview-button-secondary">Sync now</span>
        <span class="preview-button">New task</span>
      </div>
    </header>

    <div class="preview-stats" aria-label="Example overview statistics">
      <div><strong>12</strong><span>Open tasks</span></div>
      <div><strong>2</strong><span>Overdue</span></div>
      <div><strong>4</strong><span>Next 7 days</span></div>
      <div><strong>3</strong><span>Urgent</span></div>
    </div>

    <article class="preview-project">
      <div class="preview-project-topline">
        <div>
          <span class="preview-eyebrow">MY PROJECTS · TODOIST</span>
          <h3>MyProject</h3>
        </div>
        <span class="preview-count">8 remaining</span>
      </div>
      <div class="preview-progress-copy">
        <span>5 completed</span><span>38%</span>
      </div>
      <progress max="100" value="38" aria-label="MyProject example progress: 38 percent">38%</progress>
      <div class="preview-project-facts">
        <span><b>Next</b> Draft project brief · Aug 4</span>
        <span><b>2</b> overdue</span>
        <span><b>1</b> without date</span>
      </div>
    </article>

    <div class="preview-tree-label">TASKS</div>
    <details class="preview-tree">
      <summary><span>MyProject</span><span class="preview-count">8 remaining</span></summary>
      <div class="preview-branch">
        <details>
          <summary><span>Prepare launch</span><time datetime="2026-08-04">Aug 4</time></summary>
          <div class="preview-leaf"><span>Review checklist</span><span class="preview-tag">P2</span></div>
          <div class="preview-leaf"><span>Send final notes</span><span class="preview-tag">planning</span></div>
        </details>
        <div class="preview-leaf"><span>Draft project brief</span><time datetime="2026-08-03">Aug 3</time></div>
      </div>
    </details>
    <p class="preview-caption">Synthetic example · no personal or Todoist data</p>
  </section>
</template>

