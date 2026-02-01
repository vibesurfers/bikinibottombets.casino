/**
 * Org Spider Graph Component
 * Cytoscape.js-based graph visualization for PE fund networks
 */

// Global cytoscape instance
window.cy = null;

// Node color scheme
const nodeColors = {
  pe_fund: '#9333ea',      // Purple
  vc_fund: '#3b82f6',      // Blue
  hedge_fund: '#f59e0b',   // Amber
  asset_manager: '#8b5cf6', // Violet
  company: '#22c55e',      // Green
  person: '#06b6d4',       // Cyan
};

// Edge colors by relationship type
const edgeColors = {
  portfolio_company: '#22c55e',
  co_investor: '#9333ea',
  subsidiary: '#f59e0b',
  strategic_partner: '#3b82f6',
  executive: '#06b6d4',
  board_member: '#ec4899',
  partner: '#8b5cf6',
  managing_director: '#8b5cf6',
  advisor: '#64748b',
  employee: '#94a3b8',
  colleague: '#06b6d4',
  founder: '#ef4444',
};

// Cytoscape style definitions
const graphStyle = [
  // Node styles
  {
    selector: 'node',
    style: {
      'label': 'data(label)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 8,
      'font-size': '11px',
      'font-family': 'Inter, sans-serif',
      'font-weight': 600,
      'color': '#e2e8f0',
      'text-outline-color': '#0f172a',
      'text-outline-width': 2,
      'background-color': '#9333ea',
      'width': 40,
      'height': 40,
      'border-width': 3,
      'border-color': '#0f172a',
      'transition-property': 'background-color, width, height',
      'transition-duration': '0.2s',
    },
  },
  // Node type-specific colors
  {
    selector: 'node[type = "pe_fund"]',
    style: { 'background-color': nodeColors.pe_fund },
  },
  {
    selector: 'node[type = "vc_fund"]',
    style: { 'background-color': nodeColors.vc_fund },
  },
  {
    selector: 'node[type = "hedge_fund"]',
    style: { 'background-color': nodeColors.hedge_fund },
  },
  {
    selector: 'node[type = "asset_manager"]',
    style: { 'background-color': nodeColors.asset_manager },
  },
  {
    selector: 'node[type = "company"]',
    style: { 'background-color': nodeColors.company },
  },
  {
    selector: 'node[type = "person"]',
    style: {
      'background-color': nodeColors.person,
      'shape': 'ellipse',
      'width': 35,
      'height': 35,
    },
  },
  // Hover state
  {
    selector: 'node:active',
    style: {
      'overlay-opacity': 0.1,
      'overlay-color': '#00d26a',
    },
  },
  // Selected node
  {
    selector: 'node:selected',
    style: {
      'border-color': '#00d26a',
      'border-width': 4,
      'width': 50,
      'height': 50,
    },
  },
  // Edge styles
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'opacity': 0.7,
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
  // Edge type-specific colors
  {
    selector: 'edge[type = "portfolio_company"]',
    style: {
      'line-color': edgeColors.portfolio_company,
      'target-arrow-color': edgeColors.portfolio_company,
    },
  },
  {
    selector: 'edge[type = "co_investor"]',
    style: {
      'line-color': edgeColors.co_investor,
      'target-arrow-color': edgeColors.co_investor,
      'line-style': 'dashed',
    },
  },
  {
    selector: 'edge[type = "executive"], edge[type = "board_member"], edge[type = "partner"], edge[type = "managing_director"]',
    style: {
      'line-color': edgeColors.partner,
      'target-arrow-color': edgeColors.partner,
    },
  },
  // Highlighted edges (connected to selected node)
  {
    selector: 'edge.highlighted',
    style: {
      'width': 3,
      'opacity': 1,
      'z-index': 10,
    },
  },
  // Faded elements (not connected to selected node)
  {
    selector: '.faded',
    style: {
      'opacity': 0.2,
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
    minZoom: 0.2,
    maxZoom: 3,
    wheelSensitivity: 0.3,
  });

  // Setup event handlers
  setupGraphEvents();
}

/**
 * Setup graph event handlers
 */
function setupGraphEvents() {
  if (!window.cy) return;

  // Node click - show details
  window.cy.on('tap', 'node', function(evt) {
    const node = evt.target;
    showNodeDetails(node);
    highlightConnected(node);
  });

  // Edge click - show relationship details
  window.cy.on('tap', 'edge', function(evt) {
    const edge = evt.target;
    showEdgeDetails(edge);
  });

  // Background click - clear selection
  window.cy.on('tap', function(evt) {
    if (evt.target === window.cy) {
      clearHighlight();
      hideDetails();
    }
  });

  // Double-click node - expand
  window.cy.on('dbltap', 'node', function(evt) {
    const node = evt.target;
    expandNode(node);
  });
}

/**
 * Render graph with nodes and edges
 */
function renderGraph(nodes, edges) {
  if (!window.cy) initGraph();

  // Clear existing elements
  window.cy.elements().remove();

  // Convert nodes to Cytoscape format
  const cyNodes = nodes.map(node => ({
    data: {
      id: node.id,
      label: truncateLabel(node.label, 20),
      fullLabel: node.label,
      type: node.type,
      entityType: node.data.entityType,
      entityId: node.data.entityId,
      orgType: node.data.orgType,
      ticker: node.data.ticker,
      title: node.data.title,
      aum: node.data.aum,
    },
  }));

  // Convert edges to Cytoscape format
  const cyEdges = edges.map(edge => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: edge.type,
      confidence: edge.data.confidence,
      startDate: edge.data.startDate,
      endDate: edge.data.endDate,
      ownershipPercent: edge.data.ownershipPercent,
    },
  }));

  // Add elements to graph
  window.cy.add([...cyNodes, ...cyEdges]);

  // Run layout
  runLayout();

  // Hide empty state
  document.getElementById('graph-empty').classList.add('hidden');
}

/**
 * Run force-directed layout
 */
function runLayout() {
  if (!window.cy || window.cy.nodes().length === 0) return;

  const layout = window.cy.layout({
    name: 'cose',
    animate: true,
    animationDuration: 500,
    nodeRepulsion: function(node) { return 8000; },
    nodeOverlap: 20,
    idealEdgeLength: function(edge) { return 100; },
    edgeElasticity: function(edge) { return 100; },
    nestingFactor: 1.2,
    gravity: 0.25,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0,
    randomize: true,
    componentSpacing: 100,
    padding: 50,
  });

  layout.run();
}

/**
 * Highlight nodes connected to the selected node
 */
function highlightConnected(node) {
  // Clear previous highlighting
  window.cy.elements().removeClass('faded highlighted');

  // Get connected elements
  const connectedEdges = node.connectedEdges();
  const connectedNodes = connectedEdges.connectedNodes();

  // Fade all elements
  window.cy.elements().addClass('faded');

  // Unfade selected node and its connections
  node.removeClass('faded');
  connectedEdges.removeClass('faded').addClass('highlighted');
  connectedNodes.removeClass('faded');
}

/**
 * Clear highlight state
 */
function clearHighlight() {
  if (!window.cy) return;
  window.cy.elements().removeClass('faded highlighted');
  window.cy.nodes().unselect();
}

/**
 * Show node details in the panel
 */
function showNodeDetails(node) {
  const data = node.data();
  const panel = document.getElementById('entity-details');
  panel.classList.add('active');

  // Icon based on type
  const icons = {
    pe_fund: '🏛️',
    vc_fund: '🚀',
    hedge_fund: '📈',
    asset_manager: '💼',
    company: '🏢',
    person: '👤',
  };

  document.getElementById('entity-icon').textContent = icons[data.type] || '📋';
  document.getElementById('entity-name').textContent = data.fullLabel || data.label;
  document.getElementById('entity-type').textContent = formatType(data.type);

  // Meta info
  const metaHtml = [];
  if (data.ticker) {
    metaHtml.push(`<div class="meta-item"><span class="meta-label">Ticker</span><span class="meta-value">${data.ticker}</span></div>`);
  }
  if (data.aum) {
    metaHtml.push(`<div class="meta-item"><span class="meta-label">AUM</span><span class="meta-value">$${formatNumber(data.aum)}</span></div>`);
  }
  if (data.title) {
    metaHtml.push(`<div class="meta-item"><span class="meta-label">Title</span><span class="meta-value">${data.title}</span></div>`);
  }
  document.getElementById('entity-meta').innerHTML = metaHtml.join('');

  // Connected relationships
  const edges = node.connectedEdges();
  const relationships = {};

  edges.forEach(edge => {
    const type = edge.data('type');
    const isSource = edge.source().id() === node.id();
    const otherNode = isSource ? edge.target() : edge.source();

    if (!relationships[type]) {
      relationships[type] = [];
    }
    relationships[type].push({
      label: otherNode.data('label'),
      id: otherNode.data('entityId'),
      type: otherNode.data('entityType'),
    });
  });

  const relsHtml = Object.entries(relationships).map(([type, items]) => `
    <div class="rel-group">
      <div class="rel-group-title">${formatType(type)} (${items.length})</div>
      ${items.slice(0, 5).map(item => `
        <div class="rel-item" onclick="loadGraph('${item.type}', '${item.id}')">
          ${item.type === 'person' ? '👤' : '🏢'} ${item.label}
        </div>
      `).join('')}
      ${items.length > 5 ? `<div class="rel-item" style="color: var(--text-muted);">+${items.length - 5} more</div>` : ''}
    </div>
  `).join('');

  document.getElementById('entity-relationships').innerHTML = relsHtml || '<p style="color: var(--text-muted)">No connections</p>';
}

/**
 * Show edge details
 */
function showEdgeDetails(edge) {
  const data = edge.data();
  const source = edge.source().data('label');
  const target = edge.target().data('label');

  // Could show in a tooltip or panel
  console.log('Edge:', source, '->', target, data.type);
}

/**
 * Hide details panel
 */
function hideDetails() {
  document.getElementById('entity-details').classList.remove('active');
}

/**
 * Expand a node (load its connections)
 */
async function expandNode(node) {
  const data = node.data();

  try {
    const response = await fetch(`/api/graph?entityType=${data.entityType}&entityId=${data.entityId}&depth=1`);
    if (!response.ok) return;

    const graphData = await response.json();

    // Add new nodes and edges that don't already exist
    graphData.nodes.forEach(newNode => {
      if (!window.cy.getElementById(newNode.id).length) {
        window.cy.add({
          data: {
            id: newNode.id,
            label: truncateLabel(newNode.label, 20),
            fullLabel: newNode.label,
            type: newNode.type,
            entityType: newNode.data.entityType,
            entityId: newNode.data.entityId,
            orgType: newNode.data.orgType,
            ticker: newNode.data.ticker,
            title: newNode.data.title,
            aum: newNode.data.aum,
          },
          position: {
            x: node.position('x') + (Math.random() - 0.5) * 200,
            y: node.position('y') + (Math.random() - 0.5) * 200,
          },
        });
      }
    });

    graphData.edges.forEach(newEdge => {
      if (!window.cy.getElementById(newEdge.id).length) {
        window.cy.add({
          data: {
            id: newEdge.id,
            source: newEdge.source,
            target: newEdge.target,
            label: newEdge.label,
            type: newEdge.type,
          },
        });
      }
    });

    // Run layout on new elements
    runLayout();

  } catch (error) {
    console.error('Failed to expand node:', error);
  }
}

/**
 * Helper: Truncate long labels
 */
function truncateLabel(label, maxLength) {
  if (!label) return '';
  if (label.length <= maxLength) return label;
  return label.substring(0, maxLength - 1) + '…';
}

/**
 * Helper: Format type for display
 */
function formatType(type) {
  if (!type) return '';
  return type.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Helper: Format large numbers
 */
function formatNumber(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}
