<?php

// Server and site values
switch ($_SERVER["SERVER_NAME"]) {
  case "edwardallengems.com":
    define("FRAMEWORK_PATH", "edwardallengems/site_content/");
    define("WEB_ROOT", "https://edwardallengems.com");
    define("SITE_NAME", "Edward Allen Gems");
    define("HOST_IP", "74.208.49.45");
    // Contact form values
    define("CTC_ACTION_URL", WEB_ROOT."/contact-smtp.php");
    define("CTC_THANKYOU", WEB_ROOT."/tkmsg.php");
    define("CTC_ERROR", WEB_ROOT."/error.php");
    define("WAR_THANKYOU", WEB_ROOT."/warmsg.php");
    define("CTC_SMTP_HOST", "smtp.titan.email");
    define("CTC_SMTP_PORT", 587);
    define("CTC_SMTP_USERNAME", "admin@edwardallengems.com");
    define("CTC_SMTP_PASSWORD","JRmnjsXyHm9.idsCGufjEtkUiRtd7Rve");
    define("CTC_SMTP_SENDER_ADDRESS","admin@edwardallengems.com");
    define("CTC_SMTP_SENDER_NAME","Contact Inquiry");
    define("CTC_SMTP_RECIPIENT_ADDRESS","contact@edwardallengems.com");
    define("CTC_SUBJECT_PREFIX","[contact] ");
    define("CTC_SMTP_RECIPIENT_NAME","EAGems Admin");
    define("CTC_CF_SITE_KEY", "0x4AAAAAAAV_cdhD-P_4esqy");
    // define("CTC_CF_SITE_KEY", "2x00000000000000000000AB"); // Fail on client-side
    define("CTC_CF_SECRET_KEY", "0x4AAAAAAAV_cVUDXve6zIpd8HdvBfeAnsk");
    // define("CTC_CF_SECRET_KEY", "2x0000000000000000000000000000000AA"); // Fail on server-side
    break;

    default:
    define("FRAMEWORK_PATH", "edwardallengems/site_content/");
    define("WEB_ROOT", "http://edwardallengems.local/");
    define("SITE_NAME", "Edward Allen Gems");
    define("HOST_IP", "127.0.0.1");
    // Contact form values
    define("CTC_ACTION_URL", WEB_ROOT."/contact-smtp.php");
    define("CTC_THANKYOU", WEB_ROOT."/tkmsg.php");
    define("CTC_ERROR", WEB_ROOT."/error.php");
    define("WAR_THANKYOU", WEB_ROOT."/warmsg.php");
    define("CTC_SMTP_HOST", "smtp.titan.email");
    define("CTC_SMTP_PORT", 587);
    define("CTC_SMTP_USERNAME", "admin@arkadias.com");
    define("CTC_SMTP_PASSWORD","@jhwyM9GdrcEHA7h8yRYNXWYEz3Wb3Mq");
    define("CTC_SMTP_SENDER_ADDRESS","admin@arkadias.com");
    define("CTC_SMTP_SENDER_NAME","Contact Inquiry");
    define("CTC_SMTP_RECIPIENT_ADDRESS","contact@arkadias.com");
    define("CTC_SUBJECT_PREFIX","[Contact] ");
    define("CTC_SMTP_RECIPIENT_NAME","EAGems Admin");
    define("CTC_CF_SITE_KEY", "0x4AAAAAAAWBofXLt34_i67D");
    // define("CTC_CF_SITE_KEY", "2x00000000000000000000AB"); // Fail on client-side
    define("CTC_CF_SECRET_KEY", "0x4AAAAAAAWBobNjHuBa_P-lmBxklRA43KA");
    // define("CTC_CF_SECRET_KEY", "2x0000000000000000000000000000000AA"); // Fail on server-side
}

// Pay Pal Cart Business values
define("PPL_ACTION_URL", "https://www.paypal.com/cgi-bin/webscr");
define("PPL_BUSINESS_ID", "support@eagems.com");
define("PPL_RETURN_URL", WEB_ROOT."/tkpay.php");
define("PPL_CANCEL_RETURN_URL", WEB_ROOT."/cancelpay.php");
define("PPL_CURRENCY", "USD");
define("PPL_CHECKOUT_LANG", "US");
define("PPL_SUBMIT_IMAGE_SRC", "https://www.paypal.com/en_US/i/btn/x-click-but22.gif");
define("PPL_RESET_IMAGE_SRC", "");
define("PPL_VIEW_IMAGE_SRC", "https://www.paypal.com/en_US/i/btn/view_cart_02.gif");
define("PPL_SUBMIT_PARAMS", 'alt="Make payments with PayPal - it\'s fast, free and secure!"');

// RSS Feed header (channel) values
define("RSS_PRODUCT_FEED_SCAN_PATTERN","*.text.php");
define("RSS_PRODUCT_FEED_EXCLUDE_PATTERN","/^[._]{1}.*/"); // Files beginning with . or _
define("RSS_PRODUCT_FEED_FILE",FRAMEWORK_PATH."feed/rss2.xml");
define("RSS_PRODUCT_FEED_URL",WEB_ROOT."feed/rss2.xml");
define("RSS_PRODUCT_FEED_IMAGE",WEB_ROOT."site_images/eagems_logo_rss_1.jpg");
define("RSS_PRODUCT_FEED_AUTH_KEY","HeQua4ram_@3ft"); // Minimum 12 characters
define("RSS_PRODUCT_FEED_TITLE","Edward Allen Gems");
define("RSS_PRODUCT_FEED_DESCRIPTION","We are rockhounds, gem and mineral collectors and lapidary arts enthusiasts.");
define("RSS_PRODUCT_FEED_AUTHOR","redhedge@edwardallengems.com (Ed and Rhonda)");
define("RSS_PRODUCT_DESCRIPTION_WORDS","24"); // Max number of words in generated item description
define("RSS_PRODUCT_FEED_COUNT","100"); // Max number of items in feed

// Menu builder values
define("MENU_CATEGORY_LIST_ID","navigation");
define("MENU_CATEGORY_LIST_STYLE","bullets"); // none, bullets, red, black, gray
define("MENU_LIST_FILE_NAME","leftmenu.list.php");
define("MENU_LIST_INDENT","          "); // Leading indent applied to ul structure, should match code around ul

?>
