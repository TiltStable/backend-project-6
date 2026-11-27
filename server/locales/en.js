// @ts-check

export default {
  translation: {
    appName: 'Task Manager',
    attributes: {
      name: 'Name',
      description: 'Description',
      statusId: 'Status',
      executorId: 'Executor',
      labels: 'Labels',
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email',
      password: 'Password',
    },
    validation: {
      required: 'Must not be empty',
      users: {
        emailTaken: 'This email is already registered',
        emailInvalid: 'Must be a valid email',
        passwordLength: 'Must be at least 3 characters',
      },
      tasks: {
        statusInvalid: 'Must be an existing status',
        executorInvalid: 'Must be an existing user',
        labelsInvalid: 'Must be existing labels',
      },
    },
    flash: {
      session: {
        create: {
          success: 'You are logged in',
          error: 'Wrong email or password',
        },
        delete: {
          success: 'You are logged out',
        },
      },
      users: {
        create: {
          error: 'Failed to register',
          success: 'User registered successfully',
        },
        update: {
          error: 'Failed to update user',
          success: 'User has been updated',
        },
        delete: {
          success: 'User has been deleted',
          blocked: 'User has related tasks',
        },
        noRights: 'You are not allowed to perform this action',
      },
      statuses: {
        create: {
          error: 'Failed to create status',
          success: 'Status successfully created',
        },
        update: {
          error: 'Failed to update status',
          success: 'Status has been updated',
        },
        delete: {
          success: 'Status has been deleted',
          blocked: 'Status is used in tasks',
        },
      },
      labels: {
        create: {
          error: 'Failed to create label',
          success: 'Label successfully created',
        },
        update: {
          error: 'Failed to update label',
          success: 'Label has been updated',
        },
        delete: {
          success: 'Label has been deleted',
          blocked: 'Label is used in tasks',
        },
      },
      tasks: {
        create: {
          error: 'Failed to create task',
          success: 'Task successfully created',
        },
        update: {
          error: 'Failed to update task',
          success: 'Task has been updated',
        },
        delete: {
          success: 'Task has been deleted',
        },
      },
      authError: 'Access denied! Please login',
    },
    layouts: {
      application: {
        users: 'Users',
        statuses: 'Statuses',
        labels: 'Labels',
        tasks: 'Tasks',
        signIn: 'Login',
        signUp: 'Register',
        signOut: 'Logout',
        footer: '© Hexlet Ltd, 2021',
      },
    },
    views: {
      session: {
        new: {
          signIn: 'Login',
          submit: 'Login',
        },
      },
      users: {
        id: 'ID',
        email: 'Email',
        createdAt: 'Created at',
        columns: {
          fullName: 'Full name',
          actions: 'Actions',
        },
        buttons: {
          edit: 'Edit',
          delete: 'Delete',
        },
        new: {
          submit: 'Register',
          signUp: 'Register',
        },
        edit: {
          edit: 'Edit user',
          submit: 'Save',
        },
      },
      statuses: {
        index: {
          index: 'Statuses',
        },
        columns: {
          id: 'ID',
          name: 'Name',
          createdAt: 'Created at',
        },
        buttons: {
          edit: 'Edit',
          delete: 'Delete',
        },
        new: {
          new: 'Create status',
          submit: 'Save',
        },
        edit: {
          edit: 'Edit status',
          submit: 'Save',
        },
      },
      labels: {
        index: {
          index: 'Labels',
        },
        columns: {
          id: 'ID',
          name: 'Name',
          createdAt: 'Created at',
        },
        buttons: {
          edit: 'Edit',
          delete: 'Delete',
        },
        new: {
          new: 'Create label',
          submit: 'Save',
        },
        edit: {
          edit: 'Edit label',
          submit: 'Save',
        },
      },
      tasks: {
        index: {
          index: 'Tasks',
          create: 'Create task',
        },
        columns: {
          id: 'ID',
          name: 'Name',
          status: 'Status',
          creator: 'Author',
          executor: 'Executor',
          createdAt: 'Created at',
        },
        buttons: {
          edit: 'Edit',
          delete: 'Delete',
        },
        new: {
          new: 'Task creation',
          submit: 'Create',
        },
        edit: {
          edit: 'Edit task',
          submit: 'Edit',
        },
        show: {
          author: 'Author',
          executor: 'Executor',
          createdAt: 'Created at',
        },
        selects: {
          chooseStatus: 'Select a status',
          chooseExecutor: 'Select an executor',
        },
        filters: {
          status: 'Status',
          executor: 'Executor',
          label: 'Label',
          onlyMine: 'Only my tasks',
          submit: 'Show',
        },
      },
      welcome: {
        index: {
          hello: 'Hello from Hexlet!',
          description: 'Online programming school',
          more: 'Learn more',
        },
      },
    },
  },
};
