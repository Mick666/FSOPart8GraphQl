const { ApolloServer, gql, UserInputError, AuthenticationError } = require('apollo-server')
const { v1: uuid } = require('uuid')
const mongoose = require('mongoose')
const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')

const jwt = require('jsonwebtoken')
const author = require('./models/author')

const JWT_SECRET = 'NEED_HERE_A_SECRET_KEY'

MONGODB_URI = 'mongodb+srv://fullstack:UNuxm8GuMTCg5zG@cluster0.lvynx.mongodb.net/graphql?retryWrites=true'

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
    .then(() => {
        console.log('connected to MongoDB')
    })
    .catch((error) => {
        console.log('error connection to MongoDB:', error.message)
    })


let authors = [
    {
        name: 'Robert Martin',
        id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
        born: 1952,
    },
    {
        name: 'Martin Fowler',
        id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
        born: 1963
    },
    {
        name: 'Fyodor Dostoevsky',
        id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
        born: 1821
    },
    {
        name: 'Joshua Kerievsky', // birthyear not known
        id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
    },
    {
        name: 'Sandi Metz', // birthyear not known
        id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
    },
]

let books = [
    {
        title: 'Clean Code',
        published: 2008,
        author: '5f9626e68a7cd22ddc43a5d2',
        id: "afa5b6f4-344d-11e9-a414-719c6709cf3e",
        genres: ['refactoring']
    },
    {
        title: 'Agile software development',
        published: 2002,
        author: '5f9626e68a7cd22ddc43a5d2',
        id: "afa5b6f5-344d-11e9-a414-719c6709cf3e",
        genres: ['agile', 'patterns', 'design']
    },
    {
        title: 'Refactoring, edition 2',
        published: 2018,
        author: '5f9627a28a7cd22ddc43a5d3',
        id: "afa5de00-344d-11e9-a414-719c6709cf3e",
        genres: ['refactoring']
    },
    {
        title: 'Refactoring to patterns',
        published: 2008,
        author: '5f9627d5c61cf32e11dca8bf',
        id: "afa5de01-344d-11e9-a414-719c6709cf3e",
        genres: ['refactoring', 'patterns']
    },
    {
        title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
        published: 2012,
        author: '5f9627e2c61cf32e11dca8c0',
        id: "afa5de02-344d-11e9-a414-719c6709cf3e",
        genres: ['refactoring', 'design']
    },
    {
        title: 'Crime and punishment',
        published: 1866,
        author: '5f9627ac8a7cd22ddc43a5d4',
        id: "afa5de03-344d-11e9-a414-719c6709cf3e",
        genres: ['classic', 'crime']
    },
    {
        title: 'The Demon ',
        published: 1872,
        author: '5f9627ac8a7cd22ddc43a5d4',
        id: "afa5de04-344d-11e9-a414-719c6709cf3e",
        genres: ['classic', 'revolution']
    },
]

const typeDefs = gql`
type Book {
  title: String!
  published: Int!
  author: Author!
  genres: [String!]!
  id: ID!
}

type Author {
    name: String!
    id: ID!
    born: Int
    bookCount: Int
}

type User {
    username: String!
    favouriteGenre: String!
    id: ID!
}
  
type Token {
    value: String!
}

type Query {
      bookCount: Int!
      authorCount: Int!
      allBooks(author: String, genre: String): [Book!]!
      allAuthors: [Author!]!
      me: User
  }
type Mutation {
    addBook(
        title: String!
        author: String!
        published: String!
        genres: [String!]!
    ): Book
    addAuthor(
        name: String!
        born: Int
    ) : Author
    editAuthor(
        name: String!
        setBornTo: String!
    ): Author
    createUser(
        username: String!
        favouriteGenre: String!
    ): User
    login(
        username: String!
        password: String!
    ): Token
}
`

const resolvers = {
    Query: {
        bookCount: () => Book.collection.countDocuments(),
        authorCount: () => Author.collection.countDocuments(),
        allBooks: async (root, args) => {
            const bookSearch = await Book.find({}).populate('author')
            console.log(bookSearch)
            if (!args.author && !args.genre) return await Book.find({}).populate('author')
            else if (!args.author) {
                return await Book.find({ genres: args.genre }).populate('author')
            } else if (!args.genre) {
                return books.filter(book => book.author === args.author)
            } else {
                return books.filter(book => book.author === args.author && book.genres.includes(args.genre))
            }
        },
        allAuthors: () => Author.find({}),
        me: (root, args, context) => {
            return context.currentUser
        }
    },
    Author: {
        bookCount: (root) => Book.collection.countDocuments({ author: { $in: [root._id] } })
    },
    Mutation: {
        addBook: async (root, args, context) => {
            let authorArg 
            if (mongoose.isValidObjectId(args.author)) {
                authorArg = args.author
            } else {
                const authorSearch = await Author.find({ name: args.author })
                if (authorSearch.length > 0) {
                    authorArg = authorSearch[0]._id
                } else {
                    const newAuthor = new Author({ name: args.author })
                    await newAuthor.save()
                    console.log(newAuthor)
                    authorArg = newAuthor._id
                }
            }

            const book = new Book({ ...args, author: authorArg._id ? authorArg._id : authorArg})

            const currentUser = context.currentUser

            if (!currentUser) {
              throw new AuthenticationError("not authenticated")
            }

            try {
                await book.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            }
            const savedBook = await Book.findById(book._id).populate('author')
            console.log(savedBook)
            return savedBook
        },
        addAuthor: async (root, args) => {
            const author = new Author({ ...args })

            try {
                await author.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            }
            return author
        },
        editAuthor: async (root, args, context) => {
            const currentUser = context.currentUser

            if (!currentUser) {
              throw new AuthenticationError("not authenticated")
            }
            
            const author = await Author.findOne({ name: args.name })
            author.born = args.setBornTo

            try {
                await author.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            }

            return author
        },
        createUser: async (root, args) => {
            const user = new User({ ...args })

            return user.save()
            .catch(error => {
              throw new UserInputError(error.message, {
                invalidArgs: args,
              })
            })
        },
        login: async (root, args) => {
            const user = await User.findOne({ username: args.username })
        
            if ( !user || args.password !== 'secred' ) {
              throw new UserInputError("wrong credentials")
            }
        
            const userForToken = {
              username: user.username,
              id: user._id,
            }
        
            return { value: jwt.sign(userForToken, JWT_SECRET) }
        },
    }
}

const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
        const auth = req ? req.headers.authorization : null
        if (auth && auth.toLowerCase().startsWith('bearer ')) {
          const decodedToken = jwt.verify(
            auth.substring(7), JWT_SECRET
          )
    
          const currentUser = await User
            .findById(decodedToken.id)
    
          return { currentUser }
        }
    }
})

server.listen().then(({ url }) => {
    console.log(`Server ready at ${url}`)
})