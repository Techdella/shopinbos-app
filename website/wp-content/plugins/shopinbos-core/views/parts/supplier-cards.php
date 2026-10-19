<?php
/**
 * Supplier cards (prototype "Who’s selling already").
 *
 * @var array $suppliers supplier view models
 */
defined( 'ABSPATH' ) || exit;
?>
<div class="g3">
	<?php foreach ( $suppliers as $s ) : ?>
		<div class="card" style="padding:12px;display:flex;flex-direction:column;gap:12px">
			<?php if ( $s['img'] ) : ?>
				<img src="<?php echo esc_url( $s['img'] ); ?>" alt="" width="360" height="180" loading="lazy" style="width:100%;height:180px;object-fit:cover;border-radius:16px">
			<?php else : ?>
				<span class="pimg-ph" style="height:180px;border-radius:16px;background:#F6F5F9" aria-hidden="true"><?php echo esc_html( mb_substr( $s['name'], 0, 1 ) ); ?></span>
			<?php endif; ?>
			<div style="padding:0 6px;display:flex;flex-direction:column;gap:4px">
				<div class="row between"><b style="font-size:16px"><?php echo esc_html( $s['name'] ); ?></b><?php if ( $s['rating'] ) : ?><span style="font-size:13px;font-weight:700">★ <?php echo esc_html( $s['rating'] ); ?></span><?php endif; ?></div>
				<span style="font-size:13px;color:#6B6779"><?php echo esc_html( implode( ' · ', array_filter( [ $s['loc'], $s['reply'] ] ) ) ); ?></span>
				<?php if ( $s['about'] ) : ?><span style="font-size:14px;margin-top:4px"><?php echo esc_html( wp_trim_words( $s['about'], 14 ) ); ?></span><?php endif; ?>
			</div>
			<a class="btn btn-ghost btn-s" href="<?php echo esc_url( $s['url'] ); ?>" style="margin:0 6px 6px"><?php esc_html_e( 'See products', 'shopinbos' ); ?></a>
		</div>
	<?php endforeach; ?>
</div>
