import { defineMailModels, start, startServer } from "@mail/../tests/mail_test_helpers";
import { useMessageActions } from "@mail/core/common/message_actions";

import { describe, expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-dom";
import { Component, markup, signal, xml } from "@odoo/owl";
import {
    contains,
    getService,
    mountWithCleanup,
    mockService,
    onRpc,
    serverState,
} from "@web/../tests/web_test_helpers";

describe.current.tags("desktop");
defineMailModels();

test("edit works on an unrelated component and does not read unused inputs", async () => {
    await start();
    const store = getService("mail.store");
    const message = store["mail.message"].insert({ id: 4000, body: markup`<p>Hello</p>` });
    let threadReads = 0;

    class Host extends Component {
        static template = xml`
            <button t-on-click="() => this.edit.onSelected()">Edit test message</button>
            <span t-if="this.menuClosed()">Menu closed</span>
        `;

        setup() {
            this.menuClosed = signal(false);
            this.actions = useMessageActions({
                message: signal(message),
                thread: () => {
                    threadReads++;
                },
                menu: { close: () => this.menuClosed.set(true) },
            });
            this.edit = this.actions.transformedActions.find((action) => action.id === "edit");
        }
    }

    const host = await mountWithCleanup(Host);
    void host.edit.condition;
    void host.edit.sequence;
    expect(threadReads).toBe(0);
    const more = host.actions.more({}, { actions: [host.edit] });
    expect(more.inputs).toBe(host.edit.inputs);
    await contains("button:text(Edit test message)").click();
    expect(message.composer.isEditComposerVisible).toBe(true);
    expect("span:text(Menu closed)").toHaveCount(1);
});

test("reaction picker closes on message replacement and reacts on the current message", async () => {
    await start();
    const selection = signal("");
    const makeMessage = (name) => ({
        canAddReaction: true,
        effectiveSelf: { in: () => false },
        reactions: [],
        react: (emoji) => selection.set(`${name}: ${emoji}`),
    });
    const message = signal(makeMessage("first"));

    class Host extends Component {
        static template = xml`
            <button name="reaction" t-ref="this.anchor" t-on-click="() => this.reaction.onSelected()">React to test message</button>
            <span t-out="this.selection()"/>
        `;

        setup() {
            this.anchor = signal.ref();
            this.selection = selection;
            const actions = useMessageActions({ message, reactionAnchorRef: this.anchor });
            this.reaction = actions.transformedActions.find((action) => action.id === "reaction");
        }
    }

    const host = await mountWithCleanup(Host);
    await contains("button:text(React to test message)").click();
    expect(".o-EmojiPicker").toHaveCount(1);
    message.set(makeMessage("second"));
    await animationFrame();
    expect(".o-EmojiPicker").toHaveCount(0);
    await contains("button:text(React to test message)").click();
    await contains(".o-EmojiPicker .o-Emoji:text(🤢)").click();
    expect("span:text(second: 🤢)").toHaveCount(1);
    expect(host.reaction.inputs.message()).toBe(message());
});

test("delete confirmation invokes the explicit callback only when confirmed", async () => {
    const pyEnv = await startServer();
    const messageId = pyEnv["mail.message"].create({
        body: "A test message",
        model: "res.partner",
        res_id: serverState.partnerId,
    });
    await start();
    const store = getService("mail.store");
    const message = store["mail.message"].insert({
        id: messageId,
        body: markup`<p>A test message</p>`,
        model: "res.partner",
        res_id: serverState.partnerId,
        thread: { model: "res.partner", id: serverState.partnerId },
    });
    const deletedMessageId = signal(0);

    class Host extends Component {
        static template = xml`
            <button t-on-click="() => this.deleteAction.onSelected()">Delete test message</button>
            <span t-out="this.deletedMessageId()"/>
        `;

        setup() {
            this.deletedMessageId = deletedMessageId;
            const actions = useMessageActions({
                message: signal(message),
                onDeleted: (deletedMessage) => deletedMessageId.set(deletedMessage.id),
            });
            this.deleteAction = actions.transformedActions.find((action) => action.id === "delete");
        }
    }

    await mountWithCleanup(Host);
    await contains("button:text(Delete test message)").click();
    expect(".modal:contains(Are you sure)").toHaveCount(1);
    await contains(".modal button:text(Discard)").click();
    expect(deletedMessageId()).toBe(0);
    expect(pyEnv["mail.message"].read(messageId)[0].body).toBe("A test message");
    await contains("button:text(Delete test message)").click();
    await contains(".modal button:text(Delete)").click();
    expect(deletedMessageId()).toBe(messageId);
    expect(pyEnv["mail.message"].read(messageId)[0].body).toBe("");
});

test("reply all keeps the selected message and thread while loading recipients", async () => {
    const recipients = Promise.withResolvers();
    const preparedEmail = signal(undefined);
    onRpc("/mail/thread/recipients", () => recipients.promise);
    mockService("action", {
        doAction(action) {
            if (action?.res_model === "mail.compose.message") {
                preparedEmail.set(action.context);
                return;
            }
            return super.doAction(...arguments);
        },
    });
    await start();
    const message = signal({
        id: 4000,
        body: markup`<p>Original body</p>`,
        subject: "Original subject",
        datetime: luxon.DateTime.fromISO("2026-11-13T10:00:00"),
        email_from: "alice@example.com",
    });
    const thread = signal({ model: "res.partner", id: 42 });

    class Host extends Component {
        static template = xml`
            <button t-on-click="() => this.reply.onSelected()">Reply to test message</button>
            <span t-if="this.preparedEmail()" t-out="this.preparedEmail().default_subject"/>
        `;

        setup() {
            this.preparedEmail = preparedEmail;
            const actions = useMessageActions({ message, thread });
            this.reply = actions.transformedActions.find((action) => action.id === "reply-all");
        }
    }

    await mountWithCleanup(Host);
    await contains("button:text(Reply to test message)").click();
    message.set({ subject: "Replacement subject" });
    thread.set({ model: "res.partner", id: 43 });
    recipients.resolve([]);
    await animationFrame();
    expect("span:text(Original subject)").toHaveCount(1);
    expect(preparedEmail().default_res_ids).toEqual([42]);
    expect(preparedEmail().default_body.toString()).toInclude("Original body");
});
