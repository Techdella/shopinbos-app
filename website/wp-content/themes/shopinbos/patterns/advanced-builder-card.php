<?php
/**
 * Title: Advanced builder card
 * Slug: shopinbos/advanced-builder-card
 * Categories: shopinbos-content
 * Description: "Want full control?" card pointing to the Pro plan.
 */
echo sib_block_html( '<div class="card" style="padding:28px;display:flex;gap:20px;align-items:center;flex-wrap:wrap"><span style="width:52px;height:52px;border-radius:16px;background:#F6F5F9;display:flex;align-items:center;justify-content:center">' . sib_theme_icon( 'layers', 24, '#16141F' ) . '</span><div style="flex:1;min-width:240px"><b style="font-size:18px">Want full control?</b><p class="p" style="margin-top:4px">The advanced builder on the web gives you every section, block and setting, with undo, versions and a live preview on phone, tablet and desktop.</p></div><a class="btn btn-ghost" href="' . esc_url( home_url( '/pricing/' ) ) . '">Included in Pro</a></div>' );
