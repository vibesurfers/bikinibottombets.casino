/**
 * Mindmap Graph Component
 * Cytoscape.js-based network visualization for the investor/tech mindmap
 */

// Global cytoscape instance
window.cy = null;

// Node color scheme by category + subtype
const nodeColors = {
  person: '#06b6d4',          // Cyan
  investor: '#8b5cf6',        // Violet
  organization: '#22c55e',    // Green
  public_company: '#22c55e',  // Green
  private_company: '#10b981', // Emerald
  startup: '#34d399',         // Light emerald
  fund: '#9333ea',            // Purple
  vc_fund: '#3b82f6',         // Blue
  pe_fund: '#9333ea',         // Purple
  hedge_fund: '#f59e0b',      // Amber
  asset_manager: '#8b5cf6',   // Violet
  accelerator: '#f97316',     // Orange
  event: '#f59e0b',           // Amber
  program: '#f97316',         // Orange
};

// Edge colors by connection category
const edgeColors = {
  invested_in: '#22c55e',
  co_invested: '#22c55e',
  led_round: '#16a34a',
  co_founded: '#ef4444',
  founded: '#ef4444',
  executive_at: '#06b6d4',
  board_member_at: '#ec4899',
  partner_at: '#8b5cf6',
  advisor_to: '#64748b',
  employee_at: '#94a3b8',
  mentor_of: '#a855f7',
  alumni_of: '#f97316',
  graduated_from: '#f97316',
  acquired: '#f59e0b',
  merged_with: '#f59e0b',
  strategic_partner: '#3b82f6',
  limited_partner_of: '#8b5cf6',
  manages_fund: '#9333ea',
};

// Resolve node color from subtype first, then category
function getNodeColor(node) {
  return nodeColors[node.subtype] || nodeColors[node.category] || '#64748b';
}

// Cytoscape style definitions
const graphStyle = [
  // Node base style
  {
    selector: 'node',
    style: {
      'label': '',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 8,
      'font-size': '11px',
      'font-family': 'Inter, sans-serif',
      'font-weight': 600,
      'color': '#e2e8f0',
      'text-outline-color': '#0f172a',
      'text-outline-width': 2,
      'text-max-width': '100px',
      'text-wrap': 'ellipsis',
      'background-color': '#64748b',
      'width': 'mapData(hubScore, 0, 500, 20, 80)',
      'height': 'mapData(hubScore, 0, 500, 20, 80)',
      'border-width': 2,
      'border-color': '#0f172a',
      'transition-property': 'background-color, width, height, opacity',
      'transition-duration': '0.2s',
    },
  },
  // Hub nodes always show labels
  {
    selector: 'node.show-label',
    style: {
      'label': 'data(label)',
    },
  },
  // Node type-specific colors
  { selector: 'node[subtype = "person"], node[subtype = "founder"], node[subtype = "executive"], node[subtype = "board_member"], node[subtype = "engineer"]', style: { 'background-color': nodeColors.person } },
  { selector: 'node[subtype = "investor"]', style: { 'background-color': nodeColors.investor } },
  { selector: 'node[subtype = "public_company"]', style: { 'background-color': nodeColors.public_company } },
  { selector: 'node[subtype = "private_company"], node[subtype = "startup"]', style: { 'background-color': nodeColors.private_company } },
  { selector: 'node[subtype = "vc_fund"]', style: { 'background-color': nodeColors.vc_fund } },
  { selector: 'node[subtype = "pe_fund"]', style: { 'background-color': nodeColors.pe_fund } },
  { selector: 'node[subtype = "hedge_fund"]', style: { 'background-color': nodeColors.hedge_fund } },
  { selector: 'node[subtype = "asset_manager"]', style: { 'background-color': nodeColors.asset_manager } },
  { selector: 'node[subtype = "accelerator"], node[subtype = "incubator"], node[subtype = "program"]', style: { 'background-color': nodeColors.accelerator } },
  // Category fallbacks
  { selector: 'node[category = "person"]', style: { 'background-color': nodeColors.person } },
  { selector: 'node[category = "fund"]', style: { 'background-color': nodeColors.fund } },
  { selector: 'node[category = "event"]', style: { 'background-color': nodeColors.event } },
  // Hover state
  {
    selector: 'node:active',
    style: {
      'label': 'data(label)',
      'overlay-opacity': 0.1,
      'overlay-color': '#00d26a',
      'z-index': 20,
    },
  },
  // Selected node
  {
    selector: 'node:selected',
    style: {
      'label': 'data(label)',
      'border-color': '#00d26a',
      'border-width': 4,
      'width': 60,
      'height': 60,
      'z-index': 20,
    },
  },
  // Edge base style
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': '#334155',
      'target-arrow-color': '#334155',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'opacity': 'mapData(confidence, 0.5, 1, 0.15, 0.6)',
      'label': '',
    },
  },
  // Edge category colors
  { selector: 'edge[category = "invested_in"], edge[category = "co_invested"], edge[category = "led_round"]', style: { 'line-color': edgeColors.invested_in, 'target-arrow-color': edgeColors.invested_in } },
  { selector: 'edge[category = "co_founded"], edge[category = "founded"]', style: { 'line-color': edgeColors.co_founded, 'target-arrow-color': edgeColors.co_founded } },
  { selector: 'edge[category = "executive_at"], edge[category = "employee_at"]', style: { 'line-color': edgeColors.executive_at, 'target-arrow-color': edgeColors.executive_at } },
  { selector: 'edge[category = "board_member_at"]', style: { 'line-color': edgeColors.board_member_at, 'target-arrow-color': edgeColors.board_member_at } },
  { selector: 'edge[category = "partner_at"], edge[category = "advisor_to"], edge[category = "mentor_of"]', style: { 'line-color': edgeColors.partner_at, 'target-arrow-color': edgeColors.partner_at } },
  { selector: 'edge[category = "graduated_from"], edge[category = "alumni_of"]', style: { 'line-color': edgeColors.graduated_from, 'target-arrow-color': edgeColors.graduated_from } },
  { selector: 'edge[category = "acquired"], edge[category = "merged_with"]', style: { 'line-color': edgeColors.acquired, 'target-arrow-color': edgeColors.acquired } },
  { selector: 'edge[category = "strategic_partner"]', style: { 'line-color': edgeColors.strategic_partner, 'target-arrow-color': edgeColors.strategic_partner, 'line-style': 'dashed' } },
  // Highlighted edges
  {
    selector: 'edge.highlighted',
    style: {
      'width': 3,
      'opacity': 1,
      'z-index': 10,
      'label': 'data(label)',
      'font-size': '9px',
      'font-family': 'Inter, sans-serif',
      'color': '#94a3b8',
      'text-rotation': 'autorotate',
      'text-margin-y': -10,
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.8,
      'text-background-padding': '2px',
    },
  },
  // Faded elements
  {
    selector: '.faded',
    style: {
      'opacity': 0.08,
    },
  },
  // Filtered-out edges (hidden by category toggle)
  {
    selector: '.edge-hidden',
    style: {
      'display': 'none',
    },
  },
];

/**
 * Initialize the Cytoscape graph
 */
function initGraph() {
  const container = document.getElementById('cy');
  if (!container) return;

  window.cy = cytoscape({
    container: container,
    style: graphStyle,
    layout: { name: 'preset' },
    minZoom: 0.1,
    maxZoom: 4,
    wheelSensitivity: 0.3,
  });

  setupGraphEvents();
  window.cy.on('zoom', updateLabelVisibility);
}

/**
 * Setup graph event handlers
 */
function setupGraphEvents() {
  if (!window.cy) return;

  // Node click
  window.cy.on('tap', 'node', function(evt) {
    const node = evt.target;
    showNodeDetails(node);
    highlightConnected(node);
  });

  // Edge click
  window.cy.on('tap', 'edge', function(evt) {
    const edge = evt.target;
    showEdgeDetails(edge);
  });

  // Background click
  window.cy.on('tap', function(evt) {
    if (evt.target === window.cy) {
      clearHighlight();
      hideDetails();
    }
  });

  // Double-click node - expand from here
  window.cy.on('dbltap', 'node', function(evt) {
    const node = evt.target;
    expandFromNode(node.data('slug'));
  });
}

/**
 * Render graph with nodes and edges (full replace)
 */
function renderGraph(nodes, edges) {
  if (!window.cy) initGraph();

  window.cy.elements().remove();

  const cyNodes = nodes.map(node => ({
    data: {
      id: node.id,
      label: buildNodeLabel(node),
      fullLabel: node.label,
      category: node.category,
      subtype: node.subtype,
      slug: node.data.slug,
      ticker: node.data.ticker,
      title: node.data.title,
      description: node.data.description,
      tags: node.data.tags,
      connectionCount: node.connectionCount,
      hubScore: node.data.hubScore || node.connectionCount * 10 || 1,
      confidence: 1,
    },
  }));

  const cyEdges = edges.map(edge => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      category: edge.category,
      confidence: edge.data.confidence || 0.5,
      amount: edge.data.amount,
      round: edge.data.round,
      title: edge.data.title,
    },
  }));

  window.cy.add([...cyNodes, ...cyEdges]);
  runLayout();
  document.getElementById('graph-empty').classList.add('hidden');
}

/**
 * Merge new graph data into existing graph (incremental)
 */
function mergeGraph(nodes, edges) {
  if (!window.cy) initGraph();

  let added = false;

  nodes.forEach(node => {
    if (!window.cy.getElementById(node.id).length) {
      window.cy.add({
        data: {
          id: node.id,
          label: buildNodeLabel(node),
          fullLabel: node.label,
          category: node.category,
          subtype: node.subtype,
          slug: node.data.slug,
          ticker: node.data.ticker,
          title: node.data.title,
          description: node.data.description,
          tags: node.data.tags,
          connectionCount: node.connectionCount,
          hubScore: node.data.hubScore || node.connectionCount * 10 || 1,
          confidence: 1,
        },
      });
      added = true;
    }
  });

  edges.forEach(edge => {
    if (!window.cy.getElementById(edge.id).length) {
      if (window.cy.getElementById(edge.source).length && window.cy.getElementById(edge.target).length) {
        window.cy.add({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label,
            category: edge.category,
            confidence: edge.data?.confidence || 0.5,
          },
        });
        added = true;
      }
    }
  });

  if (added) {
    runLayout();
    document.getElementById('graph-empty').classList.add('hidden');
  }

  return added;
}

/**
 * Run layout - concentric for small graphs, cose for large
 */
function runLayout() {
  if (!window.cy || window.cy.nodes().length === 0) return;

  const nodeCount = window.cy.nodes().length;

  if (nodeCount <= 80) {
    window.cy.layout({
      name: 'concentric',
      animate: true,
      animationDuration: 600,
      concentric: function(node) {
        return node.data('hubScore') || node.degree();
      },
      levelWidth: function() { return 2; },
      minNodeSpacing: 60,
      padding: 60,
      startAngle: 3 / 2 * Math.PI,
      clockwise: true,
    }).run();
  } else {
    window.cy.layout({
      name: 'cose',
      animate: true,
      animationDuration: 800,
      nodeRepulsion: function(node) {
        return 20000 + (node.data('hubScore') || node.degree()) * 3000;
      },
      nodeOverlap: 40,
      idealEdgeLength: function(edge) {
        const srcDeg = edge.source().degree();
        const tgtDeg = edge.target().degree();
        const minDeg = Math.min(srcDeg, tgtDeg);
        return minDeg <= 2 ? 200 : 120;
      },
      edgeElasticity: function() { return 200; },
      nestingFactor: 1.2,
      gravity: 0.4,
      numIter: 2000,
      initialTemp: 300,
      coolingFactor: 0.95,
      minTemp: 1.0,
      randomize: true,
      componentSpacing: 200,
      padding: 80,
    }).run();
  }

  setTimeout(updateLabelVisibility, 700);
}

/**
 * Adaptive label visibility based on zoom level and hub score
 */
function updateLabelVisibility() {
  if (!window.cy) return;

  const zoom = window.cy.zoom();
  const nodes = window.cy.nodes();
  if (nodes.length === 0) return;

  let maxScore = 1;
  nodes.forEach(n => {
    const s = n.data('hubScore') || n.degree();
    if (s > maxScore) maxScore = s;
  });

  const threshold = Math.max(1, Math.floor(maxScore * Math.max(0, 0.5 - zoom * 0.3)));

  nodes.forEach(node => {
    const score = node.data('hubScore') || node.degree();
    if (score >= threshold || zoom >= 1.5) {
      node.addClass('show-label');
    } else {
      node.removeClass('show-label');
    }
  });
}

/**
 * Highlight connected nodes/edges, fade the rest
 */
function highlightConnected(node) {
  window.cy.elements().removeClass('faded highlighted');

  const connectedEdges = node.connectedEdges().filter(e => !e.hasClass('edge-hidden'));
  const connectedNodes = connectedEdges.connectedNodes();

  window.cy.elements().addClass('faded');

  node.removeClass('faded').addClass('show-label');
  connectedEdges.removeClass('faded').addClass('highlighted');
  connectedNodes.removeClass('faded').addClass('show-label');
}

/**
 * Clear all highlighting
 */
function clearHighlight() {
  if (!window.cy) return;
  window.cy.elements().removeClass('faded highlighted');
  window.cy.nodes().unselect();
  updateLabelVisibility();
}

/**
 * Show node details in the side panel
 */
function showNodeDetails(node) {
  const data = node.data();
  const panel = document.getElementById('entity-details');
  const richBody = document.getElementById('entity-rich-body');

  panel.classList.add('active');

  // Header
  const icon = data.category === 'person' ? '👤' :
    data.subtype === 'vc_fund' ? '🚀' :
    data.subtype === 'accelerator' || data.subtype === 'program' ? '🎓' :
    data.category === 'fund' ? '💰' : '🏢';

  document.getElementById('entity-icon').textContent = icon;
  document.getElementById('entity-name').textContent = data.fullLabel || data.label;
  document.getElementById('entity-type').textContent = formatType(data.subtype || data.category);

  // Build rich detail from graph data
  let html = '';

  // Description
  if (data.description) {
    const needsClamp = data.description.length > 200;
    html += `<div class="detail-section">`;
    html += `<div class="entity-description${needsClamp ? ' clamped' : ''}" id="entity-desc">${escapeHtml(data.description)}</div>`;
    if (needsClamp) {
      html += `<button class="entity-description-toggle" onclick="toggleDescription()">Show more</button>`;
    }
    html += `</div>`;
  }

  // Meta table
  const metaItems = [];
  if (data.ticker) metaItems.push(metaRow('Ticker', data.ticker));
  if (data.title) metaItems.push(metaRow('Title', data.title));
  if (data.connectionCount) metaItems.push(metaRow('Connections', data.connectionCount));
  if (data.hubScore) metaItems.push(metaRow('Hub Score', Math.round(data.hubScore)));

  if (metaItems.length > 0) {
    html += `<div class="detail-section">
      <div class="detail-section-title">Details</div>
      <div class="entity-meta">${metaItems.join('')}</div>
    </div>`;
  }

  // Tags
  const tags = data.tags || [];
  if (tags.length > 0) {
    html += `<div class="detail-section">
      <div class="detail-section-title">Tags</div>
      <div class="entity-tags">${tags.map(t => `<span class="entity-tag">${escapeHtml(t)}</span>`).join('')}</div>
    </div>`;
  }

  // Relationships from graph edges
  const edges = node.connectedEdges().filter(e => !e.hasClass('edge-hidden'));
  const relationships = [];
  edges.forEach(edge => {
    const edgeData = edge.data();
    const isSource = edge.source().id() === node.id();
    const otherNode = isSource ? edge.target() : edge.source();
    relationships.push({
      relType: edgeData.category,
      label: otherNode.data('fullLabel') || otherNode.data('label'),
      slug: otherNode.data('slug'),
      nodeCategory: otherNode.data('category'),
      title: edgeData.title,
      confidence: edgeData.confidence,
    });
  });

  html += renderRelationships(relationships);

  // Expand from here button
  if (data.slug) {
    html += `<button class="spider-from-btn" onclick="expandFromNode('${escapeHtml(data.slug)}')">
      🔍 Expand from here
    </button>`;
  }

  richBody.innerHTML = html;
}

/**
 * Render relationships grouped by type
 */
function renderRelationships(relationships) {
  if (!relationships || relationships.length === 0) {
    return '<p style="color: var(--text-muted); font-size: 0.85rem;">No connections</p>';
  }

  const grouped = {};
  relationships.forEach(rel => {
    if (!grouped[rel.relType]) grouped[rel.relType] = [];
    grouped[rel.relType].push(rel);
  });

  return Object.entries(grouped).map(([type, items]) => `
    <div class="detail-section">
      <div class="detail-section-title">${formatType(type)} (${items.length})</div>
      <div class="rel-group">
        ${items.slice(0, 10).map(item => {
          const meta = [];
          if (item.title) meta.push(item.title);
          if (item.confidence && item.confidence < 0.8) meta.push('~' + Math.round(item.confidence * 100) + '%');
          const metaStr = meta.length > 0 ? `<span class="rel-item-meta">${escapeHtml(meta.join(' · '))}</span>` : '';
          const icon = item.nodeCategory === 'person' ? '👤' : item.nodeCategory === 'fund' ? '💰' : '🏢';
          return `<div class="rel-item" onclick="searchAndFocus('${escapeHtml(item.slug || item.label)}')">
            ${icon} ${escapeHtml(item.label)}${metaStr}
          </div>`;
        }).join('')}
        ${items.length > 10 ? `<div class="rel-item" style="color: var(--text-muted); cursor: default;">+${items.length - 10} more</div>` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * Show edge details (simple console log for now)
 */
function showEdgeDetails(edge) {
  const data = edge.data();
  const source = edge.source().data('fullLabel') || edge.source().data('label');
  const target = edge.target().data('fullLabel') || edge.target().data('label');
  console.log('Edge:', source, '→', target, data.category, data.label);
}

/**
 * Hide details panel
 */
function hideDetails() {
  document.getElementById('entity-details').classList.remove('active');
}

/**
 * Filter edges by category (checkbox toggles)
 */
function filterByCategory(enabledCategories) {
  if (!window.cy) return;

  window.cy.edges().forEach(edge => {
    const cat = edge.data('category');
    if (enabledCategories.includes(cat)) {
      edge.removeClass('edge-hidden');
    } else {
      edge.addClass('edge-hidden');
    }
  });
}

/**
 * Filter by confidence threshold (slider)
 */
function filterByConfidence(threshold) {
  if (!window.cy) return;

  window.cy.edges().forEach(edge => {
    const conf = edge.data('confidence') || 0;
    if (conf >= threshold) {
      edge.removeClass('edge-hidden');
    } else {
      edge.addClass('edge-hidden');
    }
  });
}

/**
 * Expand graph from a specific actor slug
 */
async function expandFromNode(slug) {
  if (!slug) return;

  const depth = document.getElementById('depth-select') ? document.getElementById('depth-select').value : '2';

  try {
    const response = await fetch(`/api/mindmap/graph?slug=${encodeURIComponent(slug)}&depth=${depth}&hubScores=true`);
    if (!response.ok) throw new Error('Failed to load graph');

    const data = await response.json();
    mergeGraph(data.nodes || [], data.edges || []);

    // Focus on the target node
    if (window.cy) {
      const node = window.cy.nodes().filter(n => n.data('slug') === slug);
      if (node.length > 0) {
        window.cy.animate({ center: { eles: node }, zoom: window.cy.zoom() }, { duration: 300 });
        showNodeDetails(node[0]);
        highlightConnected(node[0]);
      }
    }
  } catch (error) {
    console.error('Expand from node error:', error);
  }
}

/**
 * Search for an actor and focus on them in the graph
 */
function searchAndFocus(slugOrLabel) {
  if (!window.cy || !slugOrLabel) return;

  // Try to find by slug first, then by label
  let node = window.cy.nodes().filter(n => n.data('slug') === slugOrLabel);
  if (node.length === 0) {
    node = window.cy.nodes().filter(n => {
      const label = (n.data('fullLabel') || n.data('label') || '').toLowerCase();
      return label === slugOrLabel.toLowerCase();
    });
  }

  if (node.length > 0) {
    window.cy.nodes().unselect();
    node[0].select();
    window.cy.animate({ center: { eles: node[0] }, zoom: Math.max(window.cy.zoom(), 1) }, { duration: 300 });
    showNodeDetails(node[0]);
    highlightConnected(node[0]);
  }
}

/**
 * Load full network graph
 */
async function showFullGraph(maxNodes) {
  document.getElementById('graph-loading').classList.remove('hidden');
  document.getElementById('graph-empty').classList.add('hidden');

  try {
    const response = await fetch(`/api/mindmap/graph?maxNodes=${maxNodes || 500}&hubScores=true`);
    if (!response.ok) throw new Error('Failed to load full graph');

    const data = await response.json();
    renderGraph(data.nodes || [], data.edges || []);
    updateStatsPanel(data.stats);
  } catch (error) {
    console.error('Full graph load error:', error);
  } finally {
    document.getElementById('graph-loading').classList.add('hidden');
  }
}

/**
 * Update the stats panel with graph stats
 */
function updateStatsPanel(stats) {
  if (!stats) return;

  document.getElementById('stat-nodes').textContent = stats.totalActors || 0;
  document.getElementById('stat-edges').textContent = stats.totalConnections || 0;

  // Top hubs list
  const hubsList = document.getElementById('top-hubs-list');
  if (hubsList && stats.topHubs) {
    hubsList.innerHTML = stats.topHubs.slice(0, 8).map(hub =>
      `<div class="hub-item" onclick="searchAndFocus('${escapeHtml(hub.name)}')">
        <span class="hub-name">${escapeHtml(hub.name)}</span>
        <span class="hub-count">${hub.connectionCount}</span>
      </div>`
    ).join('');
  }
}

// ==================== Helper Functions ====================

function buildNodeLabel(node) {
  const label = node.label || '';
  const data = node.data || {};

  if ((node.category === 'person' || node.subtype === 'person') && data.title) {
    return truncateLabel(`${label}`, 20);
  }
  if (data.ticker) {
    return truncateLabel(`${label} [${data.ticker}]`, 25);
  }
  return truncateLabel(label, 20);
}

function truncateLabel(label, maxLength) {
  if (!label) return '';
  if (label.length <= maxLength) return label;
  return label.substring(0, maxLength - 1) + '…';
}

function formatType(type) {
  if (!type) return '';
  return type.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(text)));
  return div.innerHTML;
}

function metaRow(label, value) {
  if (!value) return '';
  return `<div class="meta-item"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(String(value))}</span></div>`;
}

function toggleDescription() {
  const desc = document.getElementById('entity-desc');
  const btn = desc ? desc.parentElement.querySelector('.entity-description-toggle') : null;
  if (!desc || !btn) return;

  if (desc.classList.contains('clamped')) {
    desc.classList.remove('clamped');
    btn.textContent = 'Show less';
  } else {
    desc.classList.add('clamped');
    btn.textContent = 'Show more';
  }
}
