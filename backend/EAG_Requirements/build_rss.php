<?php
/* Set menu label and HTML page title, use lower case, style set by CSS */
$htmlTitle = 'build rss';

/* Set menu categories, or leave empty to exclude from the menu*/
/* Use lower case, separate category names with '>', see _menu.text */
$menuEntry = '';

/* Set meta keywords and meta description */
/* Formatting/white space in "<<<hdoc_metaWords" is critical - do not alter */
$metaWords = <<<hdoc_metaWords
<META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW">
    <script type="text/javascript" src="./scripts/sha1.js"></script>

hdoc_metaWords;
/* Formatting/white space in "<<<hdoc_metaWords" is critical - do not alter */

/* No changes to be made below */
require_once('framework.config.php');
session_start();
/* Automatically determine $subPage value - this 'filename' or 'catalog' */
$subPage = file_exists(basename(str_ireplace(".php", ".text.php", __FILE__))) ? "catalog" : basename(__FILE__, ".php");
$pageTitle = SITE_NAME." :: ".$htmlTitle;

require_once('page.template.php');
?>
