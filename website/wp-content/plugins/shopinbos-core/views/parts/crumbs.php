<?php
/**
 * Breadcrumbs. Last crumb is the current page.
 *
 * @var array $crumbs [label, url][]
 */
defined( 'ABSPATH' ) || exit;
if ( empty( $crumbs ) ) {
	return;
}
$last = count( $crumbs ) - 1;
?>
<nav aria-label="<?php esc_attr_e( 'Breadcrumb', 'shopinbos' ); ?>" class="crumbs">
	<a href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Home', 'shopinbos' ); ?></a>
	<?php foreach ( $crumbs as $i => [ $label, $url ] ) : ?>
		<span aria-hidden="true">/</span>
		<?php if ( $i === $last ) : ?>
			<span aria-current="page"><?php echo esc_html( $label ); ?></span>
		<?php else : ?>
			<a href="<?php echo esc_url( $url ); ?>"><?php echo esc_html( $label ); ?></a>
		<?php endif; ?>
	<?php endforeach; ?>
</nav>
