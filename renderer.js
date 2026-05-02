const MODES = {
  life: {
    total: 52 * 80,
    cols: 52,
    rowsPerBlock: 10,
    blocks: 8,
    unitLabel: '週',
    blockLabelFn: (i) => `第 ${i * 10 + 1}–${(i + 1) * 10} 年`
  },
  residency: {
    total: 7 * 26 * 8,
    cols: 7,
    rowsPerBlock: 26,
    blocks: 8,
    unitLabel: '天',
    blockLabelFn: (i) => {
      const half = i % 2 === 0 ? '上' : '下'
      const year = Math.floor(i / 2) + 1
      return `第${year}年${half}`
    }
  }
}

let currentMode = 'life'
let data = { life: { dots: {} }, residency: { dots: {} }, settings: {} }
let selectedDot = null
let showingAllNotes = false

async function init() {
  data = await window.electronAPI.readData()
  if (!data.life) data.life = { dots: {} }
  if (!data.residency) data.residency = { dots: {} }
  if (!data.life.dots) data.life.dots = {}
  if (!data.residency.dots) data.residency.dots = {}
  if (!data.settings) data.settings = {}

  setupResizeObserver()
  renderGrid()

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFloatPanel()
  })
}

function setupResizeObserver() {
  const container = document.getElementById('blocks-container')
  const ro = new ResizeObserver(() => updateDotSizes())
  ro.observe(container)
}

function updateDotSizes() {
  const container = document.getElementById('blocks-container')
  const w = container.clientWidth
  const h = container.clientHeight
  if (w === 0 || h === 0) return

  const gap = 1

  let dotSize, borderW

  if (currentMode === 'life') {
    // Layout: 2 columns × 4 rows. Each block: 52 cols × 10 rows.
    // CSS: gap 6px (rows), 16px (cols) → align-content: space-evenly distributes vertical space
    const colGap = 16
    const colW = (w - colGap) / 2
    const sizeByW = Math.floor((colW - 51 * gap) / 52)

    // 4 blocks per col, each: label ~13px + 10 dot rows; 3 row-gaps × 6px = 18px
    // space-evenly adds equal space above/below/between: (h - total_content) / 5 per gap
    // Approximate: total dot rows = 40, labels = 4×13 = 52, gaps = 3×6 = 18 → content ≈ 40*(s+gap)+70
    // Solve: 40*(s+gap) ≤ h - 70  →  s ≤ (h-70)/40 - gap
    const sizeByH = Math.floor((h - 70) / 40 - gap)

    dotSize = Math.max(4, Math.min(sizeByW, sizeByH, 14))
  } else {
    // Layout: 8 columns × 1 row. Each block: 7 cols × 26 rows.
    const blockGap = 6
    const blockW = (w - 7 * blockGap) / 8
    const sizeByW = Math.floor((blockW - 6 * gap) / 7)

    // Single row: label ~13px + 26 dot rows
    const sizeByH = Math.floor((h - 16) / 26 - gap)

    dotSize = Math.max(4, Math.min(sizeByW, sizeByH, 16))
  }

  borderW = dotSize <= 7 ? 1 : 1.5
  document.documentElement.style.setProperty('--dot-size', `${dotSize}px`)
  document.documentElement.style.setProperty('--dot-gap', `${gap}px`)
  document.documentElement.style.setProperty('--dot-border', `${borderW}px`)
}

function switchMode(mode) {
  currentMode = mode
  selectedDot = null
  showingAllNotes = false

  document.getElementById('tab-life').classList.toggle('active', mode === 'life')
  document.getElementById('tab-residency').classList.toggle('active', mode === 'residency')
  document.getElementById('all-notes-btn').textContent = 'All Notes'
  closeFloatPanel()

  renderGrid()
}

function renderGrid() {
  const cfg = MODES[currentMode]
  const container = document.getElementById('blocks-container')
  const modeLabel = document.getElementById('mode-label')

  container.className = `blocks-container layout-${currentMode}`
  modeLabel.textContent = currentMode === 'life'
    ? `人生週曆 — 每點 1 週，共 ${cfg.total.toLocaleString()} 點（80 年）`
    : `住院醫師週曆 — 每點 1 天，共 ${cfg.total.toLocaleString()} 點（4 年）`

  container.innerHTML = ''
  const dots = data[currentMode].dots

  for (let b = 0; b < cfg.blocks; b++) {
    const blockEl = document.createElement('div')
    blockEl.className = 'block'

    const labelEl = document.createElement('div')
    labelEl.className = 'block-label'
    labelEl.textContent = cfg.blockLabelFn(b)
    blockEl.appendChild(labelEl)

    const startRow = b * cfg.rowsPerBlock

    for (let r = 0; r < cfg.rowsPerBlock; r++) {
      const rowEl = document.createElement('div')
      rowEl.className = 'dot-row'

      for (let c = 0; c < cfg.cols; c++) {
        const idx = (startRow + r) * cfg.cols + c
        const dotEl = document.createElement('div')
        dotEl.className = 'dot'
        dotEl.dataset.idx = idx

        if (dots[idx] && dots[idx].colored) dotEl.classList.add('colored')
        if (selectedDot === idx) dotEl.classList.add('selected')

        dotEl.addEventListener('click', (e) => {
          e.preventDefault()
          handleDotClick(idx)
        })

        dotEl.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          handleDotRightClick(idx, dotEl)
        })

        rowEl.appendChild(dotEl)
      }
      blockEl.appendChild(rowEl)
    }
    container.appendChild(blockEl)
  }

  requestAnimationFrame(updateDotSizes)
}

function handleDotClick(idx) {
  selectedDot = idx
  showingAllNotes = false
  document.getElementById('all-notes-btn').textContent = 'All Notes'

  document.querySelectorAll('.dot.selected').forEach(d => d.classList.remove('selected'))
  const dotEl = document.querySelector(`.dot[data-idx="${idx}"]`)
  if (dotEl) dotEl.classList.add('selected')

  showNotePanel(idx)
}

function handleDotRightClick(idx, dotEl) {
  if (!data[currentMode].dots[idx]) {
    data[currentMode].dots[idx] = { colored: false, note: '' }
  }
  data[currentMode].dots[idx].colored = !data[currentMode].dots[idx].colored
  dotEl.classList.toggle('colored', data[currentMode].dots[idx].colored)
  saveData()
}

// Floating panel

function closeFloatPanel() {
  const panel = document.getElementById('float-panel')
  panel.classList.remove('open')
  panel.innerHTML = ''
  document.querySelectorAll('.dot.selected').forEach(d => d.classList.remove('selected'))
  selectedDot = null
  showingAllNotes = false
  document.getElementById('all-notes-btn').textContent = 'All Notes'
}

function showNotePanel(idx) {
  const cfg = MODES[currentMode]
  const percent = ((idx + 1) / cfg.total * 100).toFixed(2)
  const dotData = data[currentMode].dots[idx] || { colored: false, note: '' }
  const panel = document.getElementById('float-panel')

  panel.innerHTML = `
    <div class="float-panel-header">
      <span class="float-panel-title">第 ${idx + 1} ${cfg.unitLabel}</span>
      <span class="float-panel-percent">${percent}%</span>
      <button class="float-close-btn" onclick="closeFloatPanel()">✕</button>
    </div>
    <textarea class="note-textarea" id="note-textarea" placeholder="記錄這段時間...">${dotData.note || ''}</textarea>
    <div class="note-save-hint">離開輸入框時自動儲存</div>
  `
  panel.classList.add('open')

  const textarea = document.getElementById('note-textarea')
  textarea.addEventListener('blur', () => {
    if (!data[currentMode].dots[idx]) {
      data[currentMode].dots[idx] = { colored: false, note: '' }
    }
    data[currentMode].dots[idx].note = textarea.value
    saveData()
  })
  textarea.focus()
}

function toggleAllNotes() {
  if (showingAllNotes) {
    closeFloatPanel()
    return
  }

  showingAllNotes = true
  selectedDot = null
  document.querySelectorAll('.dot.selected').forEach(d => d.classList.remove('selected'))
  document.getElementById('all-notes-btn').textContent = '關閉'
  showAllNotesPanel()
}

function showAllNotesPanel() {
  const cfg = MODES[currentMode]
  const dots = data[currentMode].dots
  const panel = document.getElementById('float-panel')

  const notedDots = Object.entries(dots)
    .filter(([, v]) => v.note && v.note.trim())
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))

  let itemsHtml = ''
  if (notedDots.length === 0) {
    itemsHtml = '<div class="all-notes-empty">目前沒有任何筆記</div>'
  } else {
    itemsHtml = notedDots.map(([idx, v]) => {
      const percent = ((parseInt(idx) + 1) / cfg.total * 100).toFixed(2)
      const safeText = v.note.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `
        <div class="note-item" onclick="jumpToNote(${idx})">
          <div class="note-item-percent">第 ${parseInt(idx) + 1} ${cfg.unitLabel} — ${percent}%</div>
          <div class="note-item-text">${safeText}</div>
        </div>
      `
    }).join('')
  }

  panel.innerHTML = `
    <div class="all-notes-panel">
      <div class="all-notes-panel-header">
        <div class="all-notes-panel-title">All Notes</div>
        <div class="all-notes-panel-actions">
          <button class="export-btn" onclick="exportNotes()">Export</button>
          <button class="float-close-btn" onclick="closeFloatPanel()">✕</button>
        </div>
      </div>
      <div class="all-notes-list">${itemsHtml}</div>
    </div>
  `
  panel.classList.add('open')
}

function jumpToNote(idx) {
  showingAllNotes = false
  handleDotClick(parseInt(idx))
  const dotEl = document.querySelector(`.dot[data-idx="${idx}"]`)
  if (dotEl) dotEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function exportNotes() {
  const cfg = MODES[currentMode]
  const dots = data[currentMode].dots
  const modeName = currentMode === 'life' ? '人生週曆' : '住院醫師週曆'

  const notedDots = Object.entries(dots)
    .filter(([, v]) => v.note && v.note.trim())
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))

  if (notedDots.length === 0) {
    alert('目前沒有任何筆記可以匯出。')
    return
  }

  const lines = [`LifeRecoder — ${modeName}`, `匯出時間：${new Date().toLocaleString('zh-TW')}`, '='.repeat(40), '']

  for (const [idx, v] of notedDots) {
    const percent = ((parseInt(idx) + 1) / cfg.total * 100).toFixed(2)
    lines.push(`【第 ${parseInt(idx) + 1} ${cfg.unitLabel} — ${percent}%】`)
    lines.push(v.note)
    lines.push('')
  }

  await window.electronAPI.exportNotes(lines.join('\n'))
}

// Settings modal

function openSettings() {
  const modal = document.getElementById('settings-modal')
  modal.classList.add('open')
  if (data.settings.birthDate) {
    document.getElementById('birth-date-input').value = data.settings.birthDate
  }
  if (data.settings.residencyStartDate) {
    document.getElementById('residency-start-input').value = data.settings.residencyStartDate
  }
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open')
}

function closeSettingsOnOverlay(event) {
  if (event.target === document.getElementById('settings-modal')) closeSettings()
}

function autoFillLife() {
  const input = document.getElementById('birth-date-input')
  const birthDateStr = input.value
  if (!birthDateStr) { alert('請先輸入出生日期'); return }

  const birthDate = new Date(birthDateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weeksElapsed = Math.max(0, Math.floor((today - birthDate) / (7 * 24 * 60 * 60 * 1000)))
  const maxDots = MODES.life.total
  const fillCount = Math.min(weeksElapsed, maxDots)

  data.settings.birthDate = birthDateStr
  for (let i = 0; i < fillCount; i++) {
    if (!data.life.dots[i]) data.life.dots[i] = { colored: false, note: '' }
    data.life.dots[i].colored = true
  }

  saveData()
  if (currentMode === 'life') renderGrid()
  alert(`已填入 ${fillCount.toLocaleString()} 週（人生 ${(fillCount / maxDots * 100).toFixed(1)}%）`)
  closeSettings()
}

function autoFillResidency() {
  const input = document.getElementById('residency-start-input')
  const startDateStr = input.value
  if (!startDateStr) { alert('請先輸入住院醫師開始日期'); return }

  const startDate = new Date(startDateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysElapsed = Math.max(0, Math.floor((today - startDate) / (24 * 60 * 60 * 1000)))
  const maxDots = MODES.residency.total
  const fillCount = Math.min(daysElapsed, maxDots)

  data.settings.residencyStartDate = startDateStr
  for (let i = 0; i < fillCount; i++) {
    if (!data.residency.dots[i]) data.residency.dots[i] = { colored: false, note: '' }
    data.residency.dots[i].colored = true
  }

  saveData()
  if (currentMode === 'residency') renderGrid()
  alert(`已填入 ${fillCount.toLocaleString()} 天（住院醫師 ${(fillCount / maxDots * 100).toFixed(1)}%）`)
  closeSettings()
}

async function saveData() {
  await window.electronAPI.writeData(data)
}

init()
