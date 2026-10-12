/* Editor side of the Shopinbos dynamic blocks: a live server-rendered preview plus settings
   generated from each block's attributes. Plain JS, no build step. */
(function (wp) {
	var el = wp.element.createElement;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var Inspector = wp.blockEditor.InspectorControls;
	var C = wp.components;
	var SSR = wp.serverSideRender;

	function control(name, def, value, set) {
		var label = name.replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); });
		var onChange = function (v) { var o = {}; o[name] = v; set(o); };
		if (def.enum) {
			return el(C.SelectControl, { key: name, label: label, value: value, options: def.enum.map(function (o) { return { label: o || '—', value: o }; }), onChange: onChange });
		}
		if (def.type === 'boolean') return el(C.ToggleControl, { key: name, label: label, checked: !!value, onChange: onChange });
		if (def.type === 'number') return el(C.TextControl, { key: name, label: label, type: 'number', value: value, onChange: function (v) { onChange(parseInt(v, 10) || 0); } });
		return el(C.TextControl, { key: name, label: label, value: value || '', onChange: onChange });
	}

	(window.SIB_BLOCKS || []).forEach(function (b) {
		if (wp.blocks.getBlockType(b.name)) return;
		wp.blocks.registerBlockType(b.name, {
			apiVersion: 3,
			title: b.title,
			category: 'widgets',
			icon: 'store',
			attributes: b.attributes,
			edit: function (props) {
				var keys = Object.keys(b.attributes);
				return el('div', useBlockProps(),
					keys.length ? el(Inspector, {}, el(C.PanelBody, { title: 'Settings' }, keys.map(function (k) { return control(k, b.attributes[k], props.attributes[k], props.setAttributes); }))) : null,
					el(C.Disabled, {}, el(SSR, { block: b.name, attributes: props.attributes, EmptyResponsePlaceholder: function () { return el('p', { style: { padding: 16, background: '#F6F5F9', borderRadius: 12 } }, b.title + ' (shows on the live page)'); } }))
				);
			},
			save: function () { return null; }
		});
	});
})(window.wp);
