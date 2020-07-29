const mongoose = require('mongoose');
const mandrill = require('mandrill-api/mandrill');

const keys = require('../config/keys');
const mandrill_client = new mandrill.Mandrill(keys.mandrill_api_key);

let message = {
    "from_email": 'no-reply@tokenhub.com',
    "to": [],
    "headers": {
        "Reply-To": 'support@tokenhub.com'
    },
    "important": false,
    "track_opens": null,
    "track_clicks": null,
    "auto_text": null,
    "auto_html": null,
    "inline_css": null,
    "url_strip_qs": null,
    "preserve_recipients": null,
    "view_content_link": null,
    "tracking_domain": null,
    "signing_domain": null,
    "return_path_domain": null,
    "merge": true,
    "merge_language": "mailchimp",
    "global_merge_vars": [],
    "tags": []
};

module.exports = (req, callback) => {
    let toMail = [];
    const tpl_name = req.tp_name;
    const item = {
        email: req.email,
        "type": "to"
    }
    toMail.push(item);
    message.to = toMail;
    message.global_merge_vars = req.global_merge_vars;
    message.tags = req.tags;
    mandrill_client.messages.sendTemplate({
        "template_name": tpl_name,
        "template_content": [],
        "message": message,
        "async": false
    }, (res) => {
        callback(null, res)
    }, (err) => {
        callback(err)
    })
};
