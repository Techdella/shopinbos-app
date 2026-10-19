<?php
/**
 * /marketplace/ and /marketplace/{category}/
 *
 * @var array $ctx
 */
defined( 'ABSPATH' ) || exit;
$cats = array_filter( $ctx['categories'], fn( $c ) => ( $c['_count']['supplierProducts'] ?? 1 ) > 0 );
$cur  = $ctx['category']['slug'] ?? '';
?>
<section class="bg-mist">
	<div class="wrap col-22" style="padding-top:56px;padding-bottom:36px;gap:18px">
		<?php echo sib_view( 'parts/crumbs', [ 'crumbs' => count( $ctx['crumbs'] ) > 1 ? $ctx['crumbs'] : [] ] ); // phpcs:ignore ?>
		<p class="eyebrow"><?php esc_html_e( 'Find stock', 'shopinbos' ); ?></p>
		<h1 class="disp h2 mw-760"><?php echo esc_html( $ctx['h1'] ); ?></h1>
		<p class="lead mw-640"><?php echo esc_html( $ctx['description'] ); ?></p>
		<form class="card searchbar" role="search" action="<?php echo esc_url( $ctx['base'] ); ?>" method="get">
			<?php echo sib_icon( 'search', 20, '#6B6779' ); // phpcs:ignore ?>
			<label for="mSearch" class="screen-reader-text"><?php esc_html_e( 'Search products', 'shopinbos' ); ?></label>
			<input id="mSearch" name="q" type="search" value="<?php echo esc_attr( $ctx['q'] ); ?>" placeholder="<?php esc_attr_e( 'Search products, e.g. leather slides', 'shopinbos' ); ?>">
			<button class="btn btn-ink btn-s" type="submit"><?php esc_html_e( 'Search', 'shopinbos' ); ?></button>
		</form>
	</div>
</section>
<section>
	<div class="wrap" style="padding-top:28px;padding-bottom:96px;display:flex;flex-direction:column;gap:24px">
		<div class="row between wrapflex" style="gap:14px">
			<nav class="chips" aria-label="<?php esc_attr_e( 'Categories', 'shopinbos' ); ?>">
				<a class="chip" href="<?php echo esc_url( home_url( '/marketplace/' ) ); ?>"<?php echo $cur ? '' : ' aria-current="page"'; ?>><?php esc_html_e( 'All', 'shopinbos' ); ?></a>
				<?php foreach ( $cats as $c ) : ?>
					<a class="chip" href="<?php echo esc_url( home_url( '/marketplace/' . $c['slug'] . '/' ) ); ?>"<?php echo $cur === $c['slug'] ? ' aria-current="page"' : ''; ?>><?php echo esc_html( $c['name'] ); ?></a>
				<?php endforeach; ?>
			</nav>
			<span style="font-size:14px;color:#6B6779;font-weight:600"><?php echo esc_html( sprintf( _n( '%s product', '%s products', $ctx['total'], 'shopinbos' ), number_format_i18n( $ctx['total'] ) ) ); ?></span>
		</div>
		<?php if ( $ctx['products'] ) : ?>
			<div class="g4">
				<?php foreach ( $ctx['products'] as $i => $p ) {
					echo sib_view( 'parts/product-card', [ 'p' => $p, 'hide' => $ctx['prices_hidden'], 'lazy' => $i > 3 ] ); // phpcs:ignore
				} ?>
			</div>
		<?php else : ?>
			<div class="empty card">
				<img src="<?php echo sib_img( 'rex-side.webp' ); ?>" alt="" width="96" height="96">
				<b style="font-size:18px"><?php echo $ctx['q'] ? esc_html( sprintf( __( 'Nothing matches “%s” yet', 'shopinbos' ), $ctx['q'] ) ) : esc_html__( 'No products here yet', 'shopinbos' ); ?></b>
				<p class="p"><?php esc_html_e( 'New suppliers join every week. Try another search, or ask for a product in the app and we’ll find a supplier.', 'shopinbos' ); ?></p>
				<a class="btn btn-ghost" href="<?php echo esc_url( home_url( '/marketplace/' ) ); ?>"><?php esc_html_e( 'See all products', 'shopinbos' ); ?></a>
			</div>
		<?php endif; ?>
		<?php if ( $ctx['pages'] > 1 ) : ?>
			<nav class="pager" aria-label="<?php esc_attr_e( 'Pages', 'shopinbos' ); ?>">
				<?php
				$link = fn( $n ) => add_query_arg( array_filter( [ 'pg' => $n > 1 ? $n : null, 'q' => $ctx['q'] ?: null ] ), $ctx['base'] );
				if ( $ctx['page'] > 1 ) : ?>
					<a class="chip" rel="prev" href="<?php echo esc_url( $link( $ctx['page'] - 1 ) ); ?>"><?php esc_html_e( 'Previous', 'shopinbos' ); ?></a>
				<?php endif;
				for ( $n = max( 1, $ctx['page'] - 2 ); $n <= min( $ctx['pages'], $ctx['page'] + 2 ); $n++ ) : ?>
					<a class="chip" href="<?php echo esc_url( $link( $n ) ); ?>"<?php echo $n === $ctx['page'] ? ' aria-current="page"' : ''; ?>><?php echo (int) $n; ?></a>
				<?php endfor;
				if ( $ctx['page'] < $ctx['pages'] ) : ?>
					<a class="chip" rel="next" href="<?php echo esc_url( $link( $ctx['page'] + 1 ) ); ?>"><?php esc_html_e( 'Next', 'shopinbos' ); ?></a>
				<?php endif; ?>
			</nav>
		<?php endif; ?>
		<div style="background:#E2F6F1;border-radius:28px;padding:28px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
			<img src="<?php echo sib_img( 'rex-side.webp' ); ?>" alt="" width="84" height="84" loading="lazy">
			<div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:6px"><b style="font-size:18px"><?php esc_html_e( 'Importing from China?', 'shopinbos' ); ?></b><p class="p" style="color:#24453F"><?php esc_html_e( 'Paste a 1688 link in the app. Rex translates it and shows the full landed cost by air or sea, before you pay a kobo.', 'shopinbos' ); ?></p></div>
			<a class="btn btn-ai" href="<?php echo esc_url( sib_go_url( 'import', [] ) ); ?>"><?php esc_html_e( 'Try it in the app', 'shopinbos' ); ?></a>
		</div>
	</div>
</section>
